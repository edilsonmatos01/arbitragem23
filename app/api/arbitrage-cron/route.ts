import { NextResponse } from 'next/server';
import ccxt, { Ticker, Exchange } from 'ccxt';
import { COMMON_BASE_ASSETS, COMMON_QUOTE_ASSET } from '@/lib/constants';
import { kv } from '@vercel/kv';

// Força a rota a ser sempre dinâmica
export const dynamic = 'force-dynamic';

const SUPPORTED_SYMBOLS = COMMON_BASE_ASSETS.map(base => `${base}/${COMMON_QUOTE_ASSET}`);

const gateio = new ccxt.gateio({ enableRateLimit: true });
const mexc = new ccxt.mexc({ enableRateLimit: true, options: { defaultType: 'swap' } }); // <-- Foco em Futuros (swap)

// Função para buscar o ticker de uma exchange com tratamento de erro
async function fetchTickerSafe(exchange: Exchange, symbol: string): Promise<Ticker | null> {
    try {
        // Assegura que os mercados estão carregados para validar o símbolo
        if (!exchange.markets[symbol]) {
            // console.warn(`Símbolo ${symbol} não encontrado na exchange ${exchange.id}`);
            return null;
        }
        return await exchange.fetchTicker(symbol);
    } catch (error) {
        // Silenciosamente ignora erros de busca de ticker individual para não poluir logs
        return null;
    }
}

// Lógica principal para encontrar oportunidades de arbitragem (Spot vs Futuros)
async function findArbitrageOpportunities() {
    console.log('Iniciando busca por oportunidades de arbitragem (Gate.io Spot vs MEXC Futures)...');

    // Carrega os mercados para ambas as exchanges uma única vez
    try {
        await Promise.all([
            gateio.loadMarkets(),
            mexc.loadMarkets()
        ]);
    } catch (error) {
        console.error("Falha ao carregar mercados, abortando a busca.", error);
        return;
    }

    const opportunities = [];

    for (const symbol of SUPPORTED_SYMBOLS) {
        // Transforma o símbolo para o formato da MEXC Futures se necessário (ex: BTC/USDT -> BTC_USDT)
        const mexcSymbol = mexc.market(symbol)?.id ?? symbol;

        const [gateioTicker, mexcTicker] = await Promise.all([
            fetchTickerSafe(gateio, symbol),
            fetchTickerSafe(mexc, mexcSymbol)
        ]);

        // Verifica se temos preços de compra (ask) na Gate.io e venda (bid) na MEXC
        if (gateioTicker?.ask && mexcTicker?.bid) {
            const buyPrice = gateioTicker.ask; // Preço de compra na Gate.io (Spot)
            const sellPrice = mexcTicker.bid; // Preço de venda na MEXC (Futures)

            if (buyPrice > 0 && sellPrice > 0) {
                const spread = ((sellPrice - buyPrice) / buyPrice) * 100;

                // Salva a oportunidade se o spread for positivo (lucro)
                if (spread > 0) {
                    opportunities.push({
                        symbol,
                        buyExchange: 'Gate.io (Spot)',
                        sellExchange: 'MEXC (Futures)',
                        buyPrice,
                        sellPrice,
                        spread: spread.toFixed(2) + '%'
                    });
                }
            }
        }
    }

    console.log(`Busca finalizada. ${opportunities.length} oportunidades encontradas.`);
    
    if (opportunities.length > 0) {
        console.log(opportunities);
    }

    // Salva as oportunidades encontradas no Vercel KV, substituindo as antigas
    await kv.set('arbitrage-opportunities', opportunities);
    console.log('Oportunidades salvas no Vercel KV.');
}


export async function GET() {
  try {
    await findArbitrageOpportunities();
    return NextResponse.json({
        message: 'Cron job (Spot/Futures) executado com sucesso.',
    }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Erro ao executar o cron job de arbitragem (Spot/Futures):', errorMessage);
    return NextResponse.json({
        message: 'Erro no servidor ao executar o cron job.',
        error: errorMessage
    }, { status: 500 });
  }
} 