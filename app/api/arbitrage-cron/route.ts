import { NextResponse } from 'next/server';
import ccxt, { Ticker, Exchange } from 'ccxt';
import { COMMON_BASE_ASSETS, COMMON_QUOTE_ASSET } from '@/lib/constants';
import { createClient } from 'redis';

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

// Lógica principal para encontrar e enriquecer oportunidades
async function findArbitrageOpportunities() {
    console.log('Iniciando busca por oportunidades de arbitragem (Gate.io Spot vs MEXC Futures)...');
    
    const redis = createClient({ url: process.env.KV_REDIS_URL });
    await redis.connect();

    // 1. Busca dados antigos para calcular o spread máximo
    const oldOpportunitiesData = await redis.get('arbitrage-opportunities');
    const oldOpportunitiesMap = new Map();
    if (oldOpportunitiesData) {
        const oldOpps = JSON.parse(oldOpportunitiesData);
        for (const opp of oldOpps) {
            oldOpportunitiesMap.set(opp.symbol, opp);
        }
    }

    // 2. Carrega mercados e busca novas oportunidades
    try {
        await Promise.all([gateio.loadMarkets(), mexc.loadMarkets()]);
    } catch (error) {
        console.error("Falha ao carregar mercados, abortando.", error);
        await redis.disconnect();
        throw error;
    }

    const newOpportunities = [];

    for (const symbol of SUPPORTED_SYMBOLS) {
        if (gateio.markets[symbol] && mexc.markets[symbol]) {
            const [gateioTicker, mexcTicker] = await Promise.all([
                fetchTickerSafe(gateio, symbol),
                fetchTickerSafe(mexc, symbol)
            ]);

            if (gateioTicker?.ask && mexcTicker?.bid && gateioTicker.ask > 0) {
                const spread = ((mexcTicker.bid - gateioTicker.ask) / gateioTicker.ask) * 100;
                
                if (spread > 0) { // Considera apenas spreads lucrativos
                    const oldOpp = oldOpportunitiesMap.get(symbol);
                    let maxSpread24h = spread;
                    let maxSpreadTimestamp = Date.now();

                    if (oldOpp?.maxSpreadTimestamp) {
                        const oneDay = 24 * 60 * 60 * 1000;
                        // Se o timestamp antigo for de menos de 24h atrás, compara. Senão, reseta.
                        if ((maxSpreadTimestamp - oldOpp.maxSpreadTimestamp) < oneDay) {
                            maxSpread24h = Math.max(spread, oldOpp.maxSpread24h || 0);
                        }
                    }

                    newOpportunities.push({
                        symbol,
                        buyExchange: 'Gate.io (Spot)',
                        sellExchange: 'MEXC (Futures)',
                        buyPrice: gateioTicker.ask,
                        sellPrice: mexcTicker.bid,
                        spread,
                        maxSpread24h,
                        maxSpreadTimestamp, // Salva o timestamp para a próxima verificação
                        status: 'Available' // Status padrão
                    });
                }
            }
        }
    }

    console.log(`Busca finalizada. ${newOpportunities.length} oportunidades encontradas.`);
    
    // 3. Salva a nova lista enriquecida no Redis
    await redis.set('arbitrage-opportunities', JSON.stringify(newOpportunities));
    await redis.disconnect();
    
    console.log('Oportunidades enriquecidas salvas no Redis.');
}

// A função GET permanece a mesma, apenas chama a lógica principal
export async function GET() {
  try {
    await findArbitrageOpportunities();
    return NextResponse.json({
        message: 'Cron job (com max spread) executado com sucesso.',
    }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Erro no cron job (com max spread):', errorMessage);
    return NextResponse.json({
        message: 'Erro no servidor ao executar o cron job.',
        error: errorMessage
    }, { status: 500 });
  }
} 