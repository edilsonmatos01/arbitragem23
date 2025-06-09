"use client";
import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { Play, Pause, RefreshCw, Clock } from 'lucide-react';

interface Opportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  maxSpread24h: number;
  lucroEstimado: string;
}

interface OpportunityFromAPI {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  maxSpread24h: number;
}

const POLLING_INTERVAL_MS = 4000;

export default function ArbitrageTable() {
  const [rankedOpportunities, setRankedOpportunities] = useState<Opportunity[]>([]);
  const [minSpread, setMinSpread] = useState(0.01);
  const [amount, setAmount] = useState(100);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string|null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAndRankOpportunities = useCallback(async () => {
    if (document.hidden) return;

    if (!isPolling) setIsLoading(true);

    try {
      const response = await fetch('/api/arbitrage/all-opportunities');
      if (!response.ok) throw new Error('Falha ao buscar dados da API');
      
      const data = await response.json();
      const newOpportunities: OpportunityFromAPI[] = data.result.list || [];

      setRankedOpportunities(prevRanked => {
        const opportunitiesMap = new Map<string, Opportunity>();
        prevRanked.forEach(opp => opportunitiesMap.set(opp.symbol, opp));

        newOpportunities.forEach(newOpp => {
          opportunitiesMap.set(newOpp.symbol, {
            ...newOpp,
            lucroEstimado: ((newOpp.spread / 100) * amount).toFixed(2),
          });
        });

        return Array.from(opportunitiesMap.values())
          .filter(opp => opp.spread > 0)
          .sort((a, b) => b.spread - a.spread)
          .slice(0, 8);
      });

    } catch (e: any) {
      setError(e.message || 'Não foi possível carregar os dados.');
      setIsPolling(false);
    } finally {
        setIsLoading(false);
    }
  }, [amount, isPolling]);

  useEffect(() => {
    if (isPolling) {
      intervalRef.current = setInterval(fetchAndRankOpportunities, POLLING_INTERVAL_MS);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPolling, fetchAndRankOpportunities]);

  const handleStart = () => {
    setError(null);
    setRankedOpportunities([]);
    fetchAndRankOpportunities(); 
    setIsPolling(true);
  };

  const handleStop = () => {
    setIsPolling(false);
  };
  
  const filteredAndSortedOpportunities = useMemo(() => {
    return rankedOpportunities.filter(o => o.spread >= minSpread);
  }, [rankedOpportunities, minSpread]);

  return (
    <div className="flex flex-col gap-6">
      {/* Barra de Filtros e Controles */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
                <label className="block text-sm font-medium text-gray-300">Spread Mínimo (%)</label>
                <input type="number" step="0.01" value={minSpread} onChange={(e) => setMinSpread(Number(e.target.value))} className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300">Valor por Operação (USDT)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300">Tipo de Arbitragem</label>
                <select disabled className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white disabled:opacity-70"><option>Inter-Corretoras</option></select>
            </div>
            <div className="flex justify-end">
            {!isPolling ? (
                <button onClick={handleStart} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 w-full justify-center md:w-auto">
                    <Play className="h-5 w-5" /> Iniciar Busca
                </button>
            ) : (
                <button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 w-full justify-center md:w-auto">
                    <Pause className="h-5 w-5" /> Pausar Busca
                </button>
            )}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300">Exchange Spot</label>
                <select disabled className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white disabled:opacity-70"><option>Gate.io</option></select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300">Exchange Futuros</label>
                <select disabled className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white disabled:opacity-70"><option>MEXC</option></select>
            </div>
            <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-300">Direção da Operação</label>
                <select disabled className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white disabled:opacity-70"><option>Comprar Spot / Vender Futuros (Spot &lt; Futuros)</option></select>
            </div>
        </div>
      </div>
      
      {/* Tabela */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-white">Oportunidades Encontradas</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">PAR</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">COMPRA</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">VENDA</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Spread Atual</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Spread Máximo (24h)</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Lucro (USD)</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">AÇÃO</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8"><RefreshCw className="animate-spin h-6 w-6 mx-auto" /></td></tr>
              ) : filteredAndSortedOpportunities.length > 0 ? (
                filteredAndSortedOpportunities.map((opp) => (
                  <tr key={opp.symbol} className="hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-white">{opp.symbol}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{opp.buyExchange}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{opp.sellExchange}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-green-400">{opp.spread.toFixed(4)}%</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400">{opp.maxSpread24h.toFixed(4)}%</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-green-400">${opp.lucroEstimado}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-xs">Executar</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">
                      {isPolling ? (
                          <>
                            <Clock className="h-8 w-8 mx-auto mb-2" />
                            <span>Nenhuma oportunidade encontrada para os filtros selecionados. Monitorando...</span>
                          </>
                      ) : (
                          <span>Clique em "Iniciar Busca" para começar a procurar oportunidades.</span>
                      )}
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 