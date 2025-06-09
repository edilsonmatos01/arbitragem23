import { NextResponse } from 'next/server';
import ccxt, { Ticker, Exchange } from 'ccxt';
import { COMMON_BASE_ASSETS, COMMON_QUOTE_ASSET } from '@/lib/constants';
import { setOpportunities } from '@/lib/opportunityCache';

// Força a rota a ser sempre dinâmica, evitando que seja executada no momento do build.
export const dynamic = 'force-dynamic';

// Reconstruindo a lista de símbolos suportados
const SUPPORTED_SYMBOLS = COMMON_BASE_ASSETS.map(base => `${base}/${COMMON_QUOTE_ASSET}`);

// Definindo os tipos de exchanges suportadas
type SupportedExchangeId = 'binance' | 'bybit' | 'gateio' | 'mexc';
const ALL_EXCHANGES: SupportedExchangeId[] = ['binance', 'bybit', 'gateio', 'mexc'];

// Função para obter uma instância da CCXT
function getCcxtInstance(exchangeId: SupportedExchangeId): Exchange | null {
  try {
    const exchangeClass = ccxt[exchangeId];
    return new exchangeClass({ enableRateLimit: true });
  } catch (e) {
    console.error(`Falha ao criar instância para ${exchangeId}`, e);
    return null;
  }
}

// Lógica principal para encontrar oportunidades de arbitragem
async function findArbitrageOpportunities() {
    const opportunities = [];
    console.log('Iniciando busca por oportunidades de arbitragem...');

    // 1. Cria instâncias e carrega os mercados de todas as exchanges UMA VEZ.
    const exchanges = await Promise.all(
        ALL_EXCHANGES.map(async (exchangeId) => {
            const instance = getCcxtInstance(exchangeId);
            if (instance) {
                try {
                    await instance.loadMarkets();
                    return { id: exchangeId, instance };
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.warn(`Falha ao carregar mercados para ${exchangeId}: ${errorMessage}`);
                    return null;
                }
            }
            return null;
        })
    );

    const validExchanges = exchanges.filter((e): e is { id: SupportedExchangeId; instance: Exchange; } => e !== null);
    
    // 2. Itera sobre cada símbolo e busca os tickers nas exchanges já carregadas.
    for (const symbol of SUPPORTED_SYMBOLS) {
        const tickers = await Promise.all(
            validExchanges.map(async (exchange) => {
                // Verifica se o símbolo existe na exchange (mercados já carregados)
                if (exchange.instance.markets[symbol]) {
                    try {
                        const ticker = await exchange.instance.fetchTicker(symbol);
                        return { exchange: exchange.id, ticker };
                    } catch (error) {
                        // Opcional: log para tickers individuais que falham
                        // const errorMessage = error instanceof Error ? error.message : String(error);
                        // console.warn(`Ticker falhou para ${symbol} em ${exchange.id}: ${errorMessage}`);
                        return null;
                    }
                }
                return null;
            })
        );

        const validTickers = tickers.filter(
            (t): t is { exchange: SupportedExchangeId; ticker: Ticker } =>
                t !== null && t.ticker !== undefined && t.ticker.bid !== undefined && t.ticker.ask !== undefined
        );

        if (validTickers.length > 1) {
            for (let i = 0; i < validTickers.length; i++) {
                for (let j = i + 1; j < validTickers.length; j++) {
                    const exchangeA = validTickers[i];
                    const exchangeB = validTickers[j];

                    // Oportunidade: Comprar na exchange A (preço ask) e vender na exchange B (preço bid)
                    if (exchangeA.ticker.ask! < exchangeB.ticker.bid!) {
                        const profit = ((exchangeB.ticker.bid! - exchangeA.ticker.ask!) / exchangeA.ticker.ask!) * 100;
                        if (profit > 0.1) { // Limiar de lucro de 0.1% para ser considerado
                            opportunities.push({
                                symbol,
                                buyAt: exchangeA.exchange,
                                sellAt: exchangeB.exchange,
                                buyPrice: exchangeA.ticker.ask,
                                sellPrice: exchangeB.ticker.bid,
                                profit: profit.toFixed(2) + '%'
                            });
                        }
                    }

                    // Oportunidade: Comprar na exchange B (preço ask) e vender na exchange A (preço bid)
                    if (exchangeB.ticker.ask! < exchangeA.ticker.bid!) {
                        const profit = ((exchangeA.ticker.bid! - exchangeB.ticker.ask!) / exchangeB.ticker.ask!) * 100;
                        if (profit > 0.1) {
                            opportunities.push({
                                symbol,
                                buyAt: exchangeB.exchange,
                                sellAt: exchangeA.exchange,
                                buyPrice: exchangeB.ticker.ask,
                                sellPrice: exchangeA.ticker.bid,
                                profit: profit.toFixed(2) + '%'
                            });
                        }
                    }
                }
            }
        }
    }

    console.log(`Busca finalizada. Oportunidades encontradas: ${opportunities.length}`);
    // console.log(opportunities); // Opcional: pode remover o log para não poluir os logs
    
    // Salva as oportunidades no cache
    setOpportunities(opportunities);

    return opportunities;
}


export async function GET() {
  try {
    await findArbitrageOpportunities();
    return NextResponse.json({
        message: 'Cron job executado com sucesso.',
    }, { status: 200 });
  } catch (error) {
    console.error('Erro ao executar o cron job de arbitragem:', error);
    return NextResponse.json({
        message: 'Erro no servidor ao executar o cron job.',
    }, { status: 500 });
  }
} 