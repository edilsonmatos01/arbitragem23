import { NextResponse } from 'next/server';
import ccxt, { Ticker, Exchange } from 'ccxt';
import { COMMON_BASE_ASSETS, COMMON_QUOTE_ASSET } from '@/lib/constants';
import { setOpportunities } from '@/lib/opportunityCache';

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

    for (const symbol of SUPPORTED_SYMBOLS) {
        const tickers = await Promise.all(
            ALL_EXCHANGES.map(async (exchangeId) => {
                const exchange = getCcxtInstance(exchangeId);
                if (!exchange) return null;

                try {
                    // Verifica se a exchange suporta o mercado antes de buscar o ticker
                    await exchange.loadMarkets();
                    if (exchange.markets[symbol]) {
                        const ticker = await exchange.fetchTicker(symbol);
                        return { exchange: exchangeId, ticker };
                    }
                    return null;
                } catch (error) {
                    // console.warn(`Não foi possível buscar o ticker para ${symbol} na ${exchangeId}:`, error.message);
                    return null;
                }
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