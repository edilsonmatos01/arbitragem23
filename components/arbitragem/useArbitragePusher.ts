"use client";
import { useEffect, useState } from 'react';
import Pusher from 'pusher-js';

// Reutilizando a interface que já definimos na tabela
interface OpportunityFromAPI {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: string;
}

// Este hook gerencia a conexão com o Pusher e o recebimento de dados
export function useArbitragePusher() {
  // O estado aqui armazena o lote de oportunidades recebido do último evento
  const [latestOpportunities, setLatestOpportunities] = useState<OpportunityFromAPI[]>([]);

  useEffect(() => {
    // Apenas executa no navegador
    if (typeof window === 'undefined') return;

    // Garante que as variáveis de ambiente do Pusher estão disponíveis
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.error("Pusher key ou cluster não estão definidos nas variáveis de ambiente.");
      return;
    }

    const pusher = new Pusher(key, {
      cluster: cluster,
      forceTLS: true,
    });

    // Assina o canal onde o backend envia os eventos
    const channel = pusher.subscribe('arbitrage-channel');

    // Define o que fazer quando um evento 'new-opportunities' for recebido
    channel.bind('new-opportunities', (data: OpportunityFromAPI[]) => {
      console.log('Novas oportunidades recebidas via Pusher:', data);
      setLatestOpportunities(data);
    });

    // Limpeza: Desconecta do Pusher quando o componente for desmontado
    return () => {
      channel.unbind_all();
      channel.unsubscribe();
      pusher.disconnect();
    };
  }, []); // O array vazio garante que a conexão seja estabelecida apenas uma vez

  return latestOpportunities;
} 