// Este é um cache em memória simples para armazenar as oportunidades de arbitragem.
// ATENÇÃO: Em um ambiente serverless (como a Vercel), o estado da memória não é garantido
// entre as invocações de função. Para produção, considere usar uma solução de
// armazenamento persistente como Vercel KV, Upstash Redis, ou um banco de dados.

let opportunitiesCache: any[] = [];
let lastUpdated: Date | null = null;

export const setOpportunities = (opportunities: any[]) => {
  opportunitiesCache = opportunities;
  lastUpdated = new Date();
};

export const getOpportunities = () => {
  return {
    opportunities: opportunitiesCache,
    lastUpdated: lastUpdated,
  };
}; 