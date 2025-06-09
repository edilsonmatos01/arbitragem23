import { NextResponse } from 'next/server';
import { pusher } from '@/src/app/api/pusher/route';
import ccxt from 'ccxt';

export async function GET(request: Request) {
  try {
    const gateio = new ccxt.gateio();
    const mexc = new ccxt.mexc();
    
    // Carregar mercados em paralelo
    await Promise.all([gateio.loadMarkets(), mexc.loadMarkets()]);

    const gateioPairs = Object.keys(gateio.markets).filter(p => p.endsWith('/USDT'));
    const mexcPairs = Object.keys(mexc.markets).filter(p => p.endsWith('/USDT'));
    let trackedPairs = gateioPairs.filter(pair => mexcPairs.includes(pair));

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

    console.log(`Monitorando ${trackedPairs.length} pares...`);

    const opportunities = [];

    // Busca todos os tickers em paralelo
    const tickerPromises = trackedPairs.flatMap(pair => [
        gateio.fetchTicker(pair),
        mexc.fetchTicker(pair)
    ]);

    const tickerResults = await Promise.allSettled(tickerPromises);

    for (let i = 0; i < trackedPairs.length; i++) {
        const pair = trackedPairs[i];
        const gateioResult = tickerResults[i * 2];
        const mexcResult = tickerResults[i * 2 + 1];

        if (gateioResult.status === 'rejected' || mexcResult.status === 'rejected') {
            // Opcional: logar o erro para depuração
            // if (gateioResult.status === 'rejected') console.error(`Erro Gate.io ${pair}:`, gateioResult.reason);
            // if (mexcResult.status === 'rejected') console.error(`Erro MEXC ${pair}:`, mexcResult.reason);
            continue;
        }

        const spotTicker = gateioResult.value;
        const futuresTicker = mexcResult.value;
        
        try {
            if (!spotTicker.ask || !futuresTicker.bid) continue;
            const spread = ((futuresTicker.bid - spotTicker.ask) / spotTicker.ask) * 100;
            if (spread > 0.01) {
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
                await pusher.trigger('arbitrage-opportunities', 'new-opportunity', opportunity);
            }

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
                    await pusher.trigger('arbitrage-opportunities', 'new-opportunity', opportunity);
                }
            }
        } catch (err) {
            console.error(`Erro ao processar arbitragem para o par ${pair}:`, err);
        }
    }

    console.log(`Verificação concluída. ${opportunities.length} oportunidades encontradas.`);

    return NextResponse.json({
        status: 'ok',
        opportunitiesCount: opportunities.length,
        opportunities,
        trackedPairsCount: trackedPairs.length
    });

  } catch (error) {
    console.error('Erro geral no cron job de arbitragem:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
} 