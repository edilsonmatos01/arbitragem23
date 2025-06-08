import { NextResponse } from 'next/server';
import { GateIoConnector } from '@/src/gateio-connector';
import { MexcConnector } from '@/src/mexc-connector';
import { MarketPrices, ArbitrageOpportunity } from '@/src/types';
import { pusher } from '@/src/app/api/pusher/route';

let marketPrices: MarketPrices = {};
let gateIoSpotConnector: GateIoConnector;
let mexcFuturesConnector: MexcConnector;

const trackedPairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]; // Pares para monitorar

function initializeConnectors() {
    marketPrices = {}; // Limpa os preços em cada inicialização
    
    // Conector para Gate.io Spot
    gateIoSpotConnector = new GateIoConnector('GATEIO_SPOT', marketPrices);
    gateIoSpotConnector.connect(trackedPairs);

    // Conector para MEXC Futuros
    mexcFuturesConnector = new MexcConnector('MEXC_FUTURES', marketPrices, () => {
        // Callback de conexão para MEXC
        mexcFuturesConnector.subscribe(trackedPairs);
    });
    mexcFuturesConnector.connect();
}

function findArbitrageOpportunities() {
    const opportunities: ArbitrageOpportunity[] = [];
    const gateioPrices = marketPrices['GATEIO_SPOT'];
    const mexcPrices = marketPrices['MEXC_FUTURES'];

    if (!gateioPrices || !mexcPrices) {
        console.log("Ainda não há dados de preços suficientes.");
        return;
    }

    for (const pair of trackedPairs) {
        const gateioData = gateioPrices[pair];
        const mexcData = mexcPrices[pair];

        if (gateioData && mexcData) {
            // Oportunidade: Comprar no Gate.io (ask), Vender no MEXC (bid)
            const buyGateSellMexcSpread = ((mexcData.bestBid - gateioData.bestAsk) / gateioData.bestAsk) * 100;
            if (buyGateSellMexcSpread > 0.1) { // Limiar de lucro de 0.1%
                const opportunity: ArbitrageOpportunity = {
                    type: 'arbitrage',
                    baseSymbol: pair,
                    profitPercentage: buyGateSellMexcSpread,
                    buyAt: { exchange: 'Gate.io', price: gateioData.bestAsk, marketType: 'spot' },
                    sellAt: { exchange: 'MEXC', price: mexcData.bestBid, marketType: 'futures' },
                    arbitrageType: 'spot_futures_inter_exchange',
                    timestamp: Date.now(),
                };
                opportunities.push(opportunity);
                pusher.trigger('arbitrage-opportunities', 'new-opportunity', opportunity);
            }

            // Oportunidade: Comprar no MEXC (ask), Vender no Gate.io (bid)
            const buyMexcSellGateSpread = ((gateioData.bestBid - mexcData.bestAsk) / mexcData.bestAsk) * 100;
            if (buyMexcSellGateSpread > 0.1) {
                const opportunity: ArbitrageOpportunity = {
                    type: 'arbitrage',
                    baseSymbol: pair,
                    profitPercentage: buyMexcSellGateSpread,
                    buyAt: { exchange: 'MEXC', price: mexcData.bestAsk, marketType: 'futures' },
                    sellAt: { exchange: 'Gate.io', price: gateioData.bestBid, marketType: 'spot' },
                    arbitrageType: 'futures_spot_inter_exchange',
                    timestamp: Date.now(),
                };
                opportunities.push(opportunity);
                pusher.trigger('arbitrage-opportunities', 'new-opportunity', opportunity);
            }
        }
    }
    if(opportunities.length > 0) {
      console.log(`Found ${opportunities.length} opportunities.`);
    }
}

// Inicializa os conectores uma vez quando o servidor/função é iniciado
initializeConnectors();

// Roda a verificação de arbitragem em um intervalo para simular um tracker
setInterval(findArbitrageOpportunities, 5000); 


export async function GET(request: Request) {
    // Este endpoint é principalmente para o Vercel Cron acionar.
    // A lógica real agora é executada em um loop de intervalo.
    // Em um cenário real, você pode querer acionar a verificação aqui.
    console.log("Cron job acionado. A verificação de arbitragem está sendo executada em segundo plano.");
    
    // Para um teste imediato, podemos chamar a função aqui também
    findArbitrageOpportunities();

    return NextResponse.json({ status: 'ok', message: 'Arbitrage check running.' });
} 