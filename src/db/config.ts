import { Sequelize } from '@sequelize/core';

export function createSequelize(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode) {
    url.searchParams.delete('sslmode');
    url.searchParams.append('sslmode', sslMode);
  }

  return new Sequelize({
    url: url.toString(),
    dialect: 'postgres',
    logging: false,
  });
} 