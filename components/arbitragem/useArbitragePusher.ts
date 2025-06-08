import { useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';

// Idealmente, esta interface ArbitrageOpportunity seria importada de um local compartilhado
// entre o backend (websocket-server.ts) e o frontend.
interface ArbitrageOpportunity {
  type: 'arbitrage'; // Assegura que estamos lidando com a mensagem correta
  baseSymbol: string; 
  profitPercentage: number;
  buyAt: {
    exchange: string;
    price: number;
    marketType: 'spot' | 'futures';
    fundingRate?: string;
    originalSymbol?: string; 
  };
  sellAt: {
    exchange: string;
    price: number;
    marketType: 'spot' | 'futures';
    fundingRate?: string;
    originalSymbol?: string; 
  };
  arbitrageType: 
    | 'spot_spot_inter_exchange'
    | 'spot_futures_inter_exchange'
    | 'futures_spot_inter_exchange'
    | 'spot_spot_intra_exchange'
    | 'spot_futures_intra_exchange'
    | 'futures_spot_intra_exchange';
    // Considere adicionar 'futures_futures_inter_exchange' se precisar distingui-lo
  timestamp: number;
  maxSpread24h?: number;
}

export function useArbitragePusher() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const pusherRef = useRef<Pusher | null>(null);

  useEffect(() => {
    if (!pusherRef.current) {
      // Initialize Pusher only on the client-side
      pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: '/api/pusher'
      });

      const channel = pusherRef.current.subscribe('arbitrage-opportunities');

      channel.bind('new-opportunity', (data: ArbitrageOpportunity) => {
        if (data.type === 'arbitrage') {
            setOpportunities((prev) => [data, ...prev.slice(0, 99)]);
        }
      });
    }

    return () => {
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
    };
  }, []);

  return opportunities;
} 