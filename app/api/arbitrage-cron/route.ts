import { NextResponse } from 'next/server';
import ccxt, { Ticker, Exchange } from 'ccxt';
import { COMMON_BASE_ASSETS, COMMON_QUOTE_ASSET } from '@/lib/constants';
import { createClient } from 'redis';
import Pusher from 'pusher';

// Força a rota a ser sempre dinâmica
export const dynamic = 'force-dynamic';

const SUPPORTED_SYMBOLS = COMMON_BASE_ASSETS.map(base => `${base}/${COMMON_QUOTE_ASSET}`);

const gateio = new ccxt.gateio({ enableRateLimit: true });
const mexc = new ccxt.mexc({ enableRateLimit: true, options: { defaultType: 'swap' } }); // <-- Foco em Futuros (swap)

// Função para buscar o ticker de uma exchange com tratamento de erro
async function fetchTickerSafe(exchange: Exchange, symbol: string): Promise<Ticker | null> {
    try {
        // A função fetchTicker já usa o cache de mercados carregados, então não é preciso verificar de novo
        return await exchange.fetchTicker(symbol);
    } catch (error) {
        // Ignora erros de busca de ticker para pares individuais (ex: timeout, par temporariamente indisponível)
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
        throw error; // Propaga o erro para ser capturado e logado pelo handler da rota
    }

    const opportunities = [];

    for (const symbol of SUPPORTED_SYMBOLS) {
        // VERIFICA se o símbolo existe em AMBAS as exchanges antes de prosseguir
        if (gateio.markets[symbol] && mexc.markets[symbol]) {
            
            const [gateioTicker, mexcTicker] = await Promise.all([
                fetchTickerSafe(gateio, symbol),
                fetchTickerSafe(mexc, symbol) // Passamos o símbolo unificado, ccxt lida com a ID interna
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
        // Se o símbolo não existir em ambas as exchanges, ele é simplesmente ignorado.
    }

    console.log(`Busca finalizada. ${opportunities.length} oportunidades encontradas.`);
    
    if (opportunities.length > 0) {
        console.log(opportunities);
    }

    // Inicializa o Pusher
    const pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID!,
        key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
        secret: process.env.PUSHER_SECRET!,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        useTLS: true
    });

    // Envia o evento para o Pusher
    await pusher.trigger('arbitrage-channel', 'new-opportunities', opportunities);
    console.log('Evento de oportunidades enviado para o Pusher.');

    // Salva as oportunidades encontradas no Redis
    const redis = createClient({ url: process.env.KV_REDIS_URL });
    await redis.connect();
    // Converte o array para string JSON antes de salvar
    await redis.set('arbitrage-opportunities', JSON.stringify(opportunities));
    await redis.disconnect();
    
    console.log('Oportunidades salvas no Redis.');
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