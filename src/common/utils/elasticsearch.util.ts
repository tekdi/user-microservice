export function isElasticsearchEnabled(): boolean {
  return process.env.USE_ELASTICSEARCH?.toLowerCase() === 'yes';
} 