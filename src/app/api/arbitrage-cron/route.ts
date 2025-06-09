import { NextResponse } from 'next/server';
import { pusher } from '@/src/app/api/pusher/route';
import ccxt from 'ccxt';

export async function GET(request: Request) {
  try {
    const gateio = new ccxt.gateio();
    const mexc = new ccxt.mexc();
    
    // Carregar todos os mercados (spot, futuros, etc.) de ambas as exchanges
    await Promise.all([gateio.loadMarkets(), mexc.loadMarkets()]);

    // 1. Filtrar mercados SPOT da Gate.io que são pares com USDT
    const gateioSpotMarkets = new Map<string, string>(); // Map a base currency (e.g., 'BTC') to its symbol (e.g., 'BTC/USDT')
    Object.values(gateio.markets)
      .filter(m => m.spot && m.quote === 'USDT' && m.active)
      .forEach(m => gateioSpotMarkets.set(m.base, m.symbol));
      
    // 2. Filtrar mercados de FUTUROS (SWAP) da MEXC que são pares com USDT
    const mexcSwapMarkets = new Map<string, string>(); // Map a base currency (e.g., 'BTC') to its symbol (e.g., 'BTC/USDT:USDT')
    Object.values(mexc.markets)
      .filter(m => m.swap && m.quote === 'USDT' && m.active)
      .forEach(m => mexcSwapMarkets.set(m.base, m.symbol));

    // 3. Identificar as bases de moedas (e.g., 'BTC', 'ETH') que existem em ambos os mapas
    const commonBases = [...gateioSpotMarkets.keys()].filter(base => mexcSwapMarkets.has(base));
    
    // Lista de pares do usuário para filtrar
    const userPairs = new Set([
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
    ]);

    // 4. Montar a lista final de pares para monitorar, filtrando pela lista do usuário
    const trackedPairsInfo = commonBases
      .map(base => ({
        base,
        gateSymbol: gateioSpotMarkets.get(base)!,
        mexcSymbol: mexcSwapMarkets.get(base)!,
      }))
      .filter(p => userPairs.has(p.gateSymbol)); // Filtra com base no símbolo da Gate.io (e.g., 'BTC/USDT')

    console.log(`Encontrados ${trackedPairsInfo.length} pares em comum (spot na Gate, futuros na MEXC) e filtrados pela sua lista.`);
    
    const opportunities = [];
    if (trackedPairsInfo.length === 0) {
        console.log("Nenhum par para verificar após os filtros. Verifique a lógica de filtragem e a lista de pares.");
    } else {
        console.log(`Verificando os seguintes pares: ${trackedPairsInfo.map(p => p.base).join(', ')}`);
    }

    // Busca todos os tickers em paralelo
    const tickerPromises = trackedPairsInfo.flatMap(p => [
        gateio.fetchTicker(p.gateSymbol),
        mexc.fetchTicker(p.mexcSymbol)
    ]);

    const tickerResults = await Promise.allSettled(tickerPromises);

    for (let i = 0; i < trackedPairsInfo.length; i++) {
        const pairInfo = trackedPairsInfo[i];
        const gateioResult = tickerResults[i * 2];
        const mexcResult = tickerResults[i * 2 + 1];

        if (gateioResult.status === 'rejected' || mexcResult.status === 'rejected') {
             if (gateioResult.status === 'rejected') console.error(`Erro ao buscar ticker spot na Gate.io para ${pairInfo.gateSymbol}:`, gateioResult.reason?.message);
             if (mexcResult.status === 'rejected') console.error(`Erro ao buscar ticker de futuros na MEXC para ${pairInfo.mexcSymbol}:`, mexcResult.reason?.message);
            continue;
        }

        const spotTicker = gateioResult.value;
        const futuresTicker = mexcResult.value;
        
        try {
            // Oportunidade: Comprar Spot (Gate.io) mais barato, Vender Futuros (MEXC) mais caro
            if (spotTicker.ask && futuresTicker.bid && spotTicker.ask > 0) {
                const spread = ((futuresTicker.bid - spotTicker.ask) / spotTicker.ask) * 100;
                if (spread > 0.01) {
                    const opportunity = {
                        type: 'arbitrage',
                        baseSymbol: pairInfo.gateSymbol,
                        profitPercentage: spread,
                        buyAt: { exchange: 'Gate.io', price: spotTicker.ask, marketType: 'spot' },
                        sellAt: { exchange: 'MEXC', price: futuresTicker.bid, marketType: 'futures' },
                        arbitrageType: 'spot_futures_inter_exchange',
                        timestamp: Date.now(),
                    };
                    opportunities.push(opportunity);
                    await pusher.trigger('arbitrage-opportunities', 'new-opportunity', opportunity);
                }
            }
            
            // Oportunidade Inversa: Comprar Futuros (MEXC) mais barato, Vender Spot (Gate.io) mais caro
            if (futuresTicker.ask && spotTicker.bid && futuresTicker.ask > 0) {
                const spreadInv = ((spotTicker.bid - futuresTicker.ask) / futuresTicker.ask) * 100;
                if (spreadInv > 0.01) {
                    const opportunity = {
                        type: 'arbitrage',
                        baseSymbol: pairInfo.gateSymbol,
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
            if (err instanceof Error) {
                console.error(`Erro ao processar arbitragem para ${pairInfo.gateSymbol}:`, err.message);
            } else {
                console.error(`Erro desconhecido ao processar arbitragem para ${pairInfo.gateSymbol}:`, err);
            }
        }
    }

    console.log(`Verificação concluída. ${opportunities.length} novas oportunidades encontradas.`);

    return NextResponse.json({
        status: 'ok',
        opportunitiesCount: opportunities.length,
        trackedPairsCount: trackedPairsInfo.length
    });

  } catch (error) {
    console.error('Erro fatal no cron job de arbitragem:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
} 