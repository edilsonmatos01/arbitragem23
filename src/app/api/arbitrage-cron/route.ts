import { NextResponse } from 'next/server';
import { GateIoConnector } from '@/src/gateio-connector';
import { MexcConnector } from '@/src/mexc-connector';
import { MarketPrices, ArbitrageOpportunity } from '@/src/types';
import { pusher } from '@/src/app/api/pusher/route';
import ccxt from 'ccxt';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  // Busca dinâmica dos pares disponíveis nas duas exchanges
  const gateio = new ccxt.gateio();
  const mexc = new ccxt.mexc();
  await gateio.loadMarkets();
  await mexc.loadMarkets();
  const gateioPairs = Object.keys(gateio.markets).filter(p => p.endsWith('/USDT'));
  const mexcPairs = Object.keys(mexc.markets).filter(p => p.endsWith('/USDT'));
  // Apenas pares que existem em ambas as exchanges
  const trackedPairs = gateioPairs.filter(pair => mexcPairs.includes(pair));

  const opportunities = [];

  for (const pair of trackedPairs) {
    try {
      // Busca preços spot na Gate.io
      const spotTicker = await gateio.fetchTicker(pair);
      // Busca preços futuros na MEXC
      const futuresSymbol = pair.replace('/', '_'); // MEXC pode usar underline
      let futuresTicker;
      try {
        futuresTicker = await mexc.fetchTicker(pair);
      } catch {
        // Tenta com underline se falhar
        futuresTicker = await mexc.fetchTicker(futuresSymbol);
      }
      if (!spotTicker.ask || !futuresTicker.bid) continue;
      // Oportunidade: Comprar Spot na Gate.io, Vender Futuros na MEXC
      const spread = ((futuresTicker.bid - spotTicker.ask) / spotTicker.ask) * 100;
      if (spread > 0.1) {
        const opportunity = {
          type: 'arbitrage',
          baseSymbol: pair,
          profitPercentage: spread,
          buyAt: { exchange: 'Gate.io', price: spotTicker.ask, marketType: 'spot' },
          sellAt: { exchange: 'MEXC', price: futuresTicker.bid, marketType: 'futures' },
          arbitrageType: 'spot_futures_inter_exchange',
          timestamp: Date.now(),
        };
        opportunities.push(opportunity);
        pusher.trigger('arbitrage-opportunities', 'new-opportunity', opportunity);
      }
      // Oportunidade inversa: Comprar Futuros na MEXC, Vender Spot na Gate.io
      if (futuresTicker.ask && spotTicker.bid) {
        const spreadInv = ((spotTicker.bid - futuresTicker.ask) / futuresTicker.ask) * 100;
        if (spreadInv > 0.1) {
          const opportunity = {
            type: 'arbitrage',
            baseSymbol: pair,
            profitPercentage: spreadInv,
            buyAt: { exchange: 'MEXC', price: futuresTicker.ask, marketType: 'futures' },
            sellAt: { exchange: 'Gate.io', price: spotTicker.bid, marketType: 'spot' },
            arbitrageType: 'futures_spot_inter_exchange',
            timestamp: Date.now(),
          };
          opportunities.push(opportunity);
          pusher.trigger('arbitrage-opportunities', 'new-opportunity', opportunity);
        }
      }
    } catch (err) {
      // Ignora erros de pares individuais
      continue;
    }
  }

  return NextResponse.json({ status: 'ok', opportunities: opportunities.length });
} 