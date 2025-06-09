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
  let trackedPairs = gateioPairs.filter(pair => mexcPairs.includes(pair));

  // Lista de pares fornecida pelo usuário
  const userPairs = [
    "WIF/USDT", "PEPE/USDT", "APT/USDT", "TURBO/USDT", "GRT/USDT", "TON/USDT", "BTC/USDT", "AVAX/USDT",
    "SOL/USDT", "LTC/USDT", "APE/USDT", "INJ/USDT", "ATOM/USDT", "DYDX/USDT", "UNI/USDT", "AAVE/USDT",
    "ARB/USDT", "BONK/USDT", "SHIB/USDT", "LDO/USDT", "NEAR/USDT", "BNB/USDT", "SEI/USDT", "ADA/USDT",
    "ETH/USDT", "TRX/USDT", "XRP/USDT", "FLOW/USDT", "1INCH/USDT", "SUI/USDT", "GMT/USDT", "FLOKI/USDT",
    "LINK/USDT", "DOT/USDT", "DOGE/USDT", "FIL/USDT", "OP/USDT", "CFX3S/USDT", "ART/USDT", "GZONE/USDT",
    "OM/USDT", "BORING/USDT", "CBL/USDT", "ACENT/USDT", "GMX/USDT", "HRT/USDT", "HTM/USDT", "ZBU/USDT",
    "DBR/USDT", "KONET/USDT", "KSM/USDT", "PNUT3L/USDT", "NGL/USDT", "PNUT/USDT", "AKUMA/USDT",
    "HEART/USDT", "APEPE/USDT", "XAR/USDT", "REDO/USDT", "AVAX5S/USDT", "REI/USDT", "EGG/USDT",
    "UNA/USDT", "LQTY/USDT", "ANIME/USDT", "LOA/USDT", "SAUBER/USDT", "A3S/USDT", "UNFI/USDT",
    "CROWN/USDT", "DIO/USDT", "RDF/USDT", "SUSHI3L/USDT", "HGET/USDT", "BDG/USDT", "GME/USDT",
    "CARAT/USDT", "FREEDOG/USDT", "VET/USDT", "ADAPAD/USDT", "OFF/USDT", "DEP/USDT", "KRO/USDT",
    "SWARMS/USDT", "YFDAI/USDT", "SGR/USDT", "NPT/USDT", "HOTCROSS/USDT", "BLUR/USDT", "STREAM/USDT",
    "AGB/USDT", "XEM/USDT", "HADES/USDT", "NMR/USDT", "PORT3/USDT", "ACE/USDT", "BCH3S/USDT",
    "SMT/USDT", "COOKIE3L/USDT", "N3/USDT"
  ];
  trackedPairs = trackedPairs.filter(pair => userPairs.includes(pair));

  console.log(`Monitorando ${trackedPairs.length} pares:`, trackedPairs);

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
      if (spread > 0.01) { // Reduzido para 0.01% para debug
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
        console.log('Oportunidade encontrada:', opportunity);
      }
      // Oportunidade inversa: Comprar Futuros na MEXC, Vender Spot na Gate.io
      if (futuresTicker.ask && spotTicker.bid) {
        const spreadInv = ((spotTicker.bid - futuresTicker.ask) / futuresTicker.ask) * 100;
        if (spreadInv > 0.01) {
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
          console.log('Oportunidade encontrada (inversa):', opportunity);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar/par de arbitragem:', pair, err);
      continue;
    }
  }

  return NextResponse.json({ status: 'ok', opportunitiesCount: opportunities.length, opportunities, trackedPairs });
} 