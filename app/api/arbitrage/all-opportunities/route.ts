import { NextResponse } from 'next/server';
import ccxt, { Ticker, Exchange } from 'ccxt';
import { COMMON_BASE_ASSETS, COMMON_QUOTE_ASSET } from '@/lib/constants';
import { createClient } from 'redis';

export const dynamic = 'force-dynamic';

const SUPPORTED_SYMBOLS = COMMON_BASE_ASSETS.map(base => `${base}/${COMMON_QUOTE_ASSET}`);

const gateio = new ccxt.gateio({ enableRateLimit: true });
const mexc = new ccxt.mexc({ enableRateLimit: true, options: { defaultType: 'swap' } });

async function fetchTickerSafe(exchange: Exchange, symbol: string): Promise<Ticker | null> {
    try {
        // Tenta buscar o ticker e retorna null em caso de erro (ex: par não existe)
        return await exchange.fetchTicker(symbol);
    } catch (error) {
        // Log silencioso para não poluir os logs com erros esperados de pares inexistentes
        // console.warn(`Aviso: Falha ao buscar ticker para ${symbol} na ${exchange.id}.`, error);
        return null;
    }
}

// Lógica principal para encontrar e enriquecer oportunidades
async function findRealTimeArbitrageOpportunities() {
    console.log('API: Iniciando busca em tempo real por oportunidades (Gate.io Spot vs MEXC Futures)...');
    
    const redis = createClient({ url: process.env.KV_REDIS_URL });
    await redis.connect();

    // 1. Busca dados antigos do Redis para calcular o spread máximo
    const oldOpportunitiesData = await redis.get('arbitrage-opportunities');
    const oldOpportunitiesMap = new Map();
    if (oldOpportunitiesData) {
        try {
            const oldOpps = JSON.parse(oldOpportunitiesData);
            for (const opp of oldOpps) {
                oldOpportunitiesMap.set(opp.symbol, opp);
            }
        } catch (e) {
            console.error("API: Erro ao parsear dados antigos do Redis. O cache pode estar corrompido.", e);
        }
    }

    // 2. Carrega mercados e busca novas oportunidades em tempo real
    try {
        await Promise.all([gateio.loadMarkets(), mexc.loadMarkets()]);
    } catch (error) {
        console.error("API: Falha ao carregar mercados, abortando.", error);
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
                        if ((maxSpreadTimestamp - oldOpp.maxSpreadTimestamp) < oneDay) {
                            maxSpread24h = Math.max(spread, oldOpp.maxSpread24h || 0);
                        } else {
                            // Se o timestamp é mais velho que 24h, o timestamp do novo spread se torna a referência
                            maxSpreadTimestamp = Date.now();
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
                        maxSpreadTimestamp, // Importante para o próximo cálculo
                    });
                }
            }
        }
    }
    
    // 3. Salva a nova lista enriquecida no Redis para a próxima chamada
    // Isso mantém o estado do `maxSpread24h` atualizado
    await redis.set('arbitrage-opportunities', JSON.stringify(newOpportunities));
    await redis.disconnect();
    
    console.log(`API: Busca finalizada. ${newOpportunities.length} oportunidades encontradas.`);
    return newOpportunities;
}

export async function GET(req: Request) {
  try {
    const opportunities = await findRealTimeArbitrageOpportunities();

    return NextResponse.json({
      result: {
        list: opportunities,
      },
      retCode: 0,
      retMsg: 'OK',
      lastUpdated: new Date(), 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('API All-Opps - Erro ao buscar oportunidades em tempo real:', errorMessage);
    return NextResponse.json({ 
        error: 'Erro do servidor ao buscar oportunidades', 
        details: errorMessage 
    }, { status: 500 });
  }
} 