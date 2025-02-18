import { Sequelize } from '@sequelize/core';

export function createSequelize(connectionString: string) {  
  console.log('Original Database URL (without password):', 
    connectionString.replace(/:[^:@]*@/, ':***@'));

  const url = new URL(connectionString);
  // Make sure we're connecting to the right database
  if (!url.pathname.includes('capricorn_bhqc3q')) {
    console.warn('Warning: Database name in URL does not match expected name');
  }

  url.searchParams.delete('sslmode');
  
  return new Sequelize({
    url: url.toString(),
    dialect: 'postgres',
    // logging: (msg) => console.log('Sequelize:', msg),
    schema: 'public'
  });
}