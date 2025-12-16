# PostgreSQL Setup Commands

## 1. Initialize PostgreSQL Data Directory
```powershell
$env:PGPASSWORD='postgres'
& "C:\Program Files\PostgreSQL\18\bin\initdb" -D "C:\PostgreSQL\data" -U postgres
```

## 2. Start PostgreSQL Server
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl" -D "C:\PostgreSQL\data" -o "-c wal_level=minimal -c max_wal_senders=0" start
```

## 3. Test Connection
```powershell
$env:PGPASSWORD='postgres'
& "C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -c "SELECT version();"
```

## 4. Create Voyagr Router Database
```powershell
$env:PGPASSWORD='postgres'
& "C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -c "CREATE DATABASE voyagr_router;"
```

## 5. Create Tables
```powershell
$env:PGPASSWORD='postgres'
& "C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -d voyagr_router << 'EOF'
CREATE TABLE nodes (id BIGINT PRIMARY KEY, lat DOUBLE PRECISION, lon DOUBLE PRECISION);
CREATE TABLE edges (from_node_id BIGINT, to_node_id BIGINT, distance_m DOUBLE PRECISION, speed_limit_kmh INT, way_id BIGINT, PRIMARY KEY (from_node_id, to_node_id));
CREATE TABLE ways (id BIGINT PRIMARY KEY, name TEXT, highway TEXT, speed_limit_kmh INT);
CREATE TABLE turn_restrictions (from_way_id BIGINT, to_way_id BIGINT, restriction_type TEXT, PRIMARY KEY (from_way_id, to_way_id));
CREATE INDEX idx_edges_from ON edges(from_node_id);
CREATE INDEX idx_edges_to ON edges(to_node_id);
CREATE INDEX idx_nodes_latlon ON nodes(lat, lon);
EOF
```

## 6. Run Migration Script
```powershell
python migrate_to_postgresql.py
```

## 7. Stop PostgreSQL Server
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl" -D "C:\PostgreSQL\data" stop
```

## 8. Restart PostgreSQL Server
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl" -D "C:\PostgreSQL\data" -o "-c wal_level=minimal -c max_wal_senders=0" restart
```

## 9. Check Server Status
```powershell
Get-Process | Where-Object {$_.ProcessName -like "*postgres*"}
```

## 10. Check Port 5432
```powershell
netstat -ano | findstr ":5432"
```

