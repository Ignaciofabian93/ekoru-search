export default () => ({
  port: parseInt(process.env.PORT || '4005', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  // Which search backend serves the `search` query: 'typesense' (default) or
  // 'postgres' (the legacy full-text strategy, kept for rollback).
  searchEngine: process.env.SEARCH_ENGINE || 'typesense',
  typesense: {
    host: process.env.TYPESENSE_HOST || 'localhost',
    port: parseInt(process.env.TYPESENSE_PORT || '8108', 10),
    protocol: process.env.TYPESENSE_PROTOCOL || 'http',
    apiKey: process.env.TYPESENSE_API_KEY || 'dev-typesense-key',
    connectionTimeoutSeconds: parseInt(
      process.env.TYPESENSE_TIMEOUT || '5',
      10,
    ),
  },
});
