#!/usr/bin/env node

import { program } from 'commander';

program
  .command('login')
  .description('Loggar in med BankID')
  .action(() => {
    console.log('Kontakta oss för att få testa vår tjänst!');
    console.log('Läs mer på https://berget.cloud')
  });

program
  .command('create cluster')
  .description('Skapar en cluster')
  .action(() => {
    console.log('Ej inloggad. Logga in först med "berget login"');

    //console.log('Done!\nAssigned DNS: ideal-palmtree.berget.cloud');
    // Lägg till logik för att skapa en cluster här
  });

program.parse(process.argv);
