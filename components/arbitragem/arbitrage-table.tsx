"use client";
import { useCallback, useState, useMemo } from "react";
import { Play, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

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
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [minSpread, setMinSpread] = useState(0.1);
  const [amount, setAmount] = useState(100);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [successMessage, setSuccessMessage] = useState<string|null>(null);

  const fetchOpportunities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setOpportunities([]); // Limpa as oportunidades antigas antes de buscar novas

    try {
      const response = await fetch('/api/arbitrage/all-opportunities');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao buscar dados da API');
      }
      const data = await response.json();
      
      const apiOpportunities: OpportunityFromAPI[] = data.result.list || [];

      const formattedOpportunities: Opportunity[] = apiOpportunities.map((opp) => {
        const spreadValue = parseFloat(opp.spread); // Converte "0.44%" para 0.44
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

      setOpportunities(formattedOpportunities);

      if(formattedOpportunities.length === 0) {
        setSuccessMessage("Nenhuma oportunidade encontrada com os critérios atuais.");
        setTimeout(() => setSuccessMessage(null), 5000);
      }

    } catch (e: any) {
      setError(e.message);
      console.error(e);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  }, [amount]);

  const filteredOpportunities = useMemo(() => {
    return opportunities
      .filter(o => o.spread >= minSpread)
      .sort((a, b) => b.spread - a.spread);
  }, [opportunities, minSpread]);

  const handleExecuteArbitrage = (opportunity: Opportunity) => {
    setSuccessMessage(`Sucesso! Arbitragem para ${opportunity.symbol} (Spread: ${opportunity.spread.toFixed(4)}%) executada.`);
    console.log("Executar arbitragem:", opportunity, "Valor aportado:", amount);
    setTimeout(() => setSuccessMessage(null), 5000);
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

        <button
          onClick={fetchOpportunities}
          disabled={isLoading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 disabled:bg-indigo-400 disabled:cursor-not-allowed"
        >
          {isLoading ? <RefreshCw className="animate-spin h-5 w-5" /> : <Play className="h-5 w-5" />}
          {isLoading ? 'Buscando...' : 'Buscar Oportunidades'}
        </button>
      </div>
      
      {/* Mensagens de Status */}
      {error && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5" /><span>Erro: {error}</span></div>}
      {successMessage && <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-lg flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /><span>{successMessage}</span></div>}

      {/* Tabela de Oportunidades Encontradas */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-white">Oportunidades Encontradas</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
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
              {isLoading && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    <div className="flex justify-center items-center gap-2">
                      <RefreshCw className="animate-spin h-5 w-5" />
                      <span>Buscando dados...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && filteredOpportunities.length > 0 && filteredOpportunities.map((opp, index) => (
                <tr key={index} className="hover:bg-gray-700 transition-colors">
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
              {!isLoading && filteredOpportunities.length === 0 && (
                 <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Clock className="h-8 w-8" />
                        <span>Nenhuma oportunidade encontrada. Clique em "Buscar Oportunidades".</span>
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