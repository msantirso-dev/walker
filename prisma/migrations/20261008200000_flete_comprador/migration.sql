-- El flete textil → club queda a cargo del comprador (separado: un valor nuevo de enum no puede usarse en la misma transacción)
ALTER TYPE "CostBearer" ADD VALUE IF NOT EXISTS 'BUYER' BEFORE 'PENDING';
