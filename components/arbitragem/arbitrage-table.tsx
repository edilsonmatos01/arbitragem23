"use client";
import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { Play, RefreshCw, AlertTriangle, CheckCircle2, Clock, ZapOff } from 'lucide-react';

interface Opportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  maxSpread24h: number;
  status: 'stable' | 'rising' | 'falling';
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

const POLLING_INTERVAL_MS = 4000; // 4 segundos

export default function ArbitrageTable() {
  const [rankedOpportunities, setRankedOpportunities] = useState<Opportunity[]>([]);
  const [minSpread, setMinSpread] = useState(0.1);
  const [amount, setAmount] = useState(100);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string|null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAndRankOpportunities = useCallback(async () => {
    if (document.hidden) return; // Otimização: não busca se a aba estiver inativa

    try {
      const response = await fetch('/api/arbitrage/all-opportunities');
      if (!response.ok) throw new Error('Falha ao buscar dados');
      
      const data = await response.json();
      const newOpportunities: OpportunityFromAPI[] = data.result.list || [];

      setRankedOpportunities(prevRanked => {
        const opportunitiesMap = new Map<string, Opportunity>();

        // 1. Adiciona oportunidades antigas ao mapa para manter o estado
        prevRanked.forEach(opp => opportunitiesMap.set(opp.symbol, opp));

        // 2. Funde com as novas oportunidades
        newOpportunities.forEach(newOpp => {
          const existingOpp = opportunitiesMap.get(newOpp.symbol);
          let status: Opportunity['status'] = 'stable';

          if (existingOpp) {
            if (newOpp.spread > existingOpp.spread) status = 'rising';
            else if (newOpp.spread < existingOpp.spread) status = 'falling';
          }

          opportunitiesMap.set(newOpp.symbol, {
            ...newOpp,
            status,
            lucroEstimado: ((newOpp.spread / 100) * amount).toFixed(2),
          });
        });

        // 3. Ordena, filtra e limita
        return Array.from(opportunitiesMap.values())
          .filter(opp => opp.spread > 0)
          .sort((a, b) => b.spread - a.spread)
          .slice(0, 8);
      });

    } catch (e: any) {
      setError('Não foi possível carregar os dados. Verifique a API.');
      console.error(e);
      setIsPolling(false); // Para o polling em caso de erro
    } finally {
        if(isLoading) setIsLoading(false);
    }
  }, [amount, isLoading]);

  useEffect(() => {
    if (isPolling) {
      intervalRef.current = setInterval(fetchAndRankOpportunities, POLLING_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPolling, fetchAndRankOpportunities]);

  const handleStart = () => {
    setIsLoading(true);
    setError(null);
    setRankedOpportunities([]);
    fetchAndRankOpportunities();
    setIsPolling(true);
  };

  const handleStop = () => {
    setIsPolling(false);
  };
  
  // Funções de formatação (formatPrice, getSpreadDisplayClass)
  const formatPrice = (price: number) => {
    if (price === 0) return '0.00';
    if (Math.abs(price) < 1) return price.toFixed(8);
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  const getSpreadStatusIcon = (status: Opportunity['status']) => {
    switch (status) {
      case 'rising': return <span className="text-green-400">▲</span>;
      case 'falling': return <span className="text-red-400">▼</span>;
      default: return <span className="text-gray-500">-</span>;
    }
  };

  const filteredAndSortedOpportunities = useMemo(() => {
    return rankedOpportunities.filter(o => o.spread >= minSpread);
  }, [rankedOpportunities, minSpread]);

  if (!isPolling && !isLoading && rankedOpportunities.length === 0) {
    return (
        <div className="text-center p-8 bg-gray-800 rounded-lg">
            <h2 className="text-xl mb-4">Monitoramento de Oportunidades</h2>
            <p className="text-gray-400 mb-6">Clique no botão abaixo para iniciar a busca por oportunidades de arbitragem em tempo real.</p>
            <button onClick={handleStart} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 mx-auto">
                <Play className="h-5 w-5" />
                Buscar Oportunidades
            </button>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Filtros e Controles */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md flex items-center justify-between gap-4">
         <div className="flex items-center gap-4">
             {/* Inputs de Valor e Spread */}
         </div>
         <button
            onClick={handleStop}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2"
          >
            <ZapOff className="h-5 w-5" />
            Parar Monitoramento
          </button>
      </div>
      
      {/* Tabela */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-white">Ranking de Oportunidades (Top 8)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Par</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Comprar Em</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Vender Em</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Spread Atual</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Max Spread (24h)</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Ação</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-center">{getSpreadStatusIcon(opp.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-xs">Executar</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">
                      <Clock className="h-8 w-8 mx-auto mb-2" />
                      Nenhuma oportunidade com o spread mínimo encontrado. Monitorando...
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