import { NextResponse } from 'next/server';
import { getOpportunities } from '@/lib/opportunityCache';
// import ccxt, { Exchange } from 'ccxt'; // Comentado - não usado se a lógica for desabilitada
// import { SUPPORTED_SYMBOLS } from '@/lib/constants'; // Comentado
// import { findTradableSymbol, SupportedExchangeId } from '@/lib/exchangeUtils'; // Comentado

// Helper para validar se a string é uma SupportedExchangeId
// function isValidSupportedExchangeId(id: string): id is SupportedExchangeId { // Comentado
//   return ['binance', 'bybit', 'gateio', 'mexc'].includes(id);
// }

// Helper para obter uma instância da CCXT de forma segura
// function getCcxtInstance(exchangeId: SupportedExchangeId): Exchange | null { // Comentado
//   if (!ccxt.exchanges.includes(exchangeId)) {
//     console.error(`All-Opps: CCXT exchange ID '${exchangeId}' não é válida ou disponível.`);
//     return null;
//   }
//   const ExchangeConstructor = ccxt[exchangeId as keyof typeof ccxt] as typeof Exchange;
//   if (typeof ExchangeConstructor !== 'function') {
//     console.error(`All-Opps: Construtor CCXT não encontrado para ID: ${exchangeId}`);
//     return null;
//   }
//   return new ExchangeConstructor({ enableRateLimit: true });
// }

// const ALL_EXCHANGES: SupportedExchangeId[] = ['binance', 'bybit', 'gateio', 'mexc']; // Comentado

export async function GET(req: Request) {
  try {
    const { opportunities, lastUpdated } = getOpportunities();
    
    return NextResponse.json({
      result: {
        list: opportunities,
      },
      retCode: 0,
      retMsg: 'OK',
      lastUpdated: lastUpdated,
    });

  } catch (error) {
    console.error('All-Opps - Erro ao buscar oportunidades do cache:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro ao buscar oportunidades do cache', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
} 