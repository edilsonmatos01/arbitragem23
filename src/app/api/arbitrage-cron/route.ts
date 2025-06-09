import { NextResponse } from 'next/server';
import { GateIoConnector } from '@/src/gateio-connector';
import { MexcConnector } from '@/src/mexc-connector';
import { MarketPrices, ArbitrageOpportunity } from '@/src/types';
import { pusher } from '@/src/app/api/pusher/route';

const trackedPairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  let marketPrices: MarketPrices = {};

  // Inicializa os conectores
  const gateIoSpotConnector = new GateIoConnector('GATEIO_SPOT', marketPrices);
  gateIoSpotConnector.connect(trackedPairs);

  const mexcFuturesConnector = new MexcConnector('MEXC_FUTURES', marketPrices, () => {
    mexcFuturesConnector.subscribe(trackedPairs);
  });
  mexcFuturesConnector.connect();

  // Aguarda alguns segundos para os preços chegarem via WebSocket
  await sleep(6000);

  const opportunities: ArbitrageOpportunity[] = [];
  const gateioPrices = marketPrices['GATEIO_SPOT'];
  const mexcPrices = marketPrices['MEXC_FUTURES'];

  if (gateioPrices && mexcPrices) {
    for (const pair of trackedPairs) {
      const gateioData = gateioPrices[pair];
      const mexcData = mexcPrices[pair];
      if (gateioData && mexcData) {
        // Oportunidade: Comprar no Gate.io (ask), Vender no MEXC (bid)
        const buyGateSellMexcSpread = ((mexcData.bestBid - gateioData.bestAsk) / gateioData.bestAsk) * 100;
        if (buyGateSellMexcSpread > 0.1) {
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
  }

  return NextResponse.json({ status: 'ok', opportunities: opportunities.length });
} 