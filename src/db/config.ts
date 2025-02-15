import { Sequelize } from '@sequelize/core';

export function createSequelize(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');

  return new Sequelize({
    url: url.toString(),
    dialect: 'postgres',
    logging: false,
  });
} 