#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username supabase_admin --dbname supabase <<-EOSQL
    DO \$\$
    BEGIN
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
            ALTER USER supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
            RAISE NOTICE 'Fixed password for supabase_auth_admin';
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
            ALTER USER authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
            RAISE NOTICE 'Fixed password for authenticator';
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
            ALTER USER supabase_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
            RAISE NOTICE 'Fixed password for supabase_admin';
        END IF;
    END
    \$\$;
EOSQL

echo "[init] Password fix script completed"
