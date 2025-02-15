import { Sequelize } from '@sequelize/core';

export function createSequelize(connectionString: string) {
  return new Sequelize({
    url: connectionString,
    logging: false,
    dialect: 'postgres'
  });
} 