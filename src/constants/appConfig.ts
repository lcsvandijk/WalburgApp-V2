export const appConfig = {
  app: {
    version: '1.0.0',
  },
  school: {
    name: 'Walburg College',
    shortName: 'Walburg',
    website: 'https://walburgcollege.nl',
  },
  layout: {
    maxContentWidth: 1180,
    tabletWidth: 768,
    landscapeWidth: 980,
  },
  schedule: {
    agendaRangeOptions: [
      { key: 'thisWeek', label: 'Deze week' },
      { key: 'nextWeek', label: 'Volgende week' },
    ] as const,
    mergeGapMs: 60_000,
  },
  ui: {
    previewLines: 2,
    newsSummaryLength: 140,
  },
} as const;
