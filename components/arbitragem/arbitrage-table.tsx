"use client";
import { useCallback, useState, useMemo, useEffect } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useArbitragePusher } from './useArbitragePusher';

// Interface para as oportunidades formatadas para a tabela
interface Opportunity {
  symbol: string;
  compraExchange: string;
  vendaExchange: string;
  compraPreco: number;
  vendaPreco: number;
  spread: number; // Em porcentagem, ex: 0.5 para 0.5%
  lucroEstimado: string;
}

// Interface para os dados crus que vêm da nossa API
interface OpportunityFromAPI {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: string; // ex: "0.44%"
}

export default function ArbitrageTable() {
  const [rankedOpportunities, setRankedOpportunities] = useState<Opportunity[]>([]);
  const [minSpread, setMinSpread] = useState(0.1);
  const [amount, setAmount] = useState(100);
  
  const [isConnecting, setIsConnecting] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // O hook agora nos fornece o lote mais recente de oportunidades do backend
  const latestOpportunitiesFromPusher = useArbitragePusher();

  // Lógica de Ranking Dinâmico
  useEffect(() => {
    // A primeira vez que o Pusher se conecta, o estado inicial é um array vazio.
    // Assim que o primeiro lote de dados chega, marcamos a conexão como estabelecida.
    if (isConnecting && latestOpportunitiesFromPusher.length > 0) {
      setIsConnecting(false);
    }
    
    // Processa o novo lote de oportunidades recebido
    const newFormattedOpportunities: Opportunity[] = latestOpportunitiesFromPusher.map((opp) => {
      const spreadValue = parseFloat(opp.spread);
      return {
        symbol: opp.symbol,
        compraExchange: opp.buyExchange,
        vendaExchange: opp.sellExchange,
        compraPreco: opp.buyPrice,
        vendaPreco: opp.sellPrice,
        spread: spreadValue,
        lucroEstimado: ((spreadValue / 100) * amount).toFixed(2),
      };
    });

    // Atualiza o ranking com os novos dados
    setRankedOpportunities(prevRanked => {
      // Cria um mapa para fundir as oportunidades existentes com as novas
      const opportunitiesMap = new Map<string, Opportunity>();
      
      // Adiciona as oportunidades já ranqueadas ao mapa
      for (const opp of prevRanked) {
        opportunitiesMap.set(opp.symbol, opp);
      }
      
      // Adiciona as novas oportunidades, substituindo as antigas se o spread for melhor
      for (const newOpp of newFormattedOpportunities) {
        const existing = opportunitiesMap.get(newOpp.symbol);
        if (!existing || newOpp.spread > existing.spread) {
          opportunitiesMap.set(newOpp.symbol, newOpp);
        }
      }

      // Converte o mapa de volta para um array, ordena e pega as 8 melhores
      const finalOpportunities = Array.from(opportunitiesMap.values())
        .sort((a, b) => b.spread - a.spread) // Ordena por maior spread
        .slice(0, 8); // Limita ao top 8
      
      return finalOpportunities;
    });

    if (latestOpportunitiesFromPusher.length > 0) {
      setLastUpdate(new Date());
    }

  }, [latestOpportunitiesFromPusher, amount, isConnecting]);


  const filteredOpportunities = useMemo(() => {
    return rankedOpportunities.filter(o => o.spread >= minSpread);
  }, [rankedOpportunities, minSpread]);
  
  const handleExecuteArbitrage = (opportunity: Opportunity) => {
    console.log("Executar arbitragem:", opportunity, "Valor aportado:", amount);
  };
  
  const formatPrice = (price: number) => {
    if (price === 0) return '0.00';
    if (Math.abs(price) < 1) {
        return price.toFixed(8);
    } 
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  const getSpreadDisplayClass = (spreadValue: number): string => {
    if (spreadValue > 0.5) return 'text-green-400 font-bold';
    if (spreadValue > 0.1) return 'text-green-300';
    return 'text-gray-300';
  };


  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Filtros e Controles */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Valor Aportado (USD)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-32 bg-gray-700 border border-gray-600 rounded-md shadow-sm p-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Spread Mínimo (%)</label>
            <input
              type="number"
              step="0.1"
              value={minSpread}
              onChange={(e) => setMinSpread(Number(e.target.value))}
              className="mt-1 w-32 bg-gray-700 border border-gray-600 rounded-md shadow-sm p-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-400">
          {isConnecting ? (
            <>
              <RefreshCw className="animate-spin h-4 w-4" />
              <span>Conectando ao feed em tempo real...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Conectado! Última atualização: {lastUpdate?.toLocaleTimeString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Tabela de Oportunidades Encontradas */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-white">Ranking de Oportunidades (Top 8)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
             {/* O thead da tabela permanece o mesmo */}
             <thead className="bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Par</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Comprar Em</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vender Em</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Preço Compra</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Preço Venda</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Spread %</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Lucro (USD)</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Ação</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {isConnecting && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    <div className="flex justify-center items-center gap-2">
                      <RefreshCw className="animate-spin h-5 w-5" />
                      <span>Aguardando o primeiro lote de dados do servidor...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!isConnecting && filteredOpportunities.length > 0 && filteredOpportunities.map((opp, index) => (
                <tr key={`${opp.symbol}-${index}`} className="hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{opp.symbol}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{opp.compraExchange}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{opp.vendaExchange}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">{formatPrice(opp.compraPreco)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">{formatPrice(opp.vendaPreco)}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${getSpreadDisplayClass(opp.spread)}`}>{opp.spread.toFixed(4)}%</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400 text-right">${opp.lucroEstimado}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleExecuteArbitrage(opp)}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-xs"
                    >
                      Executar
                    </button>
                  </td>
                </tr>
              ))}
              {!isConnecting && filteredOpportunities.length === 0 && (
                 <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Clock className="h-8 w-8" />
                        <span>Nenhuma oportunidade com o spread mínimo foi encontrada no último ciclo. Aguardando...</span>
                      </div>
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