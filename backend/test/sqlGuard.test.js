'use strict';
/**
 * Pruebas de la guarda de SQL. Ejecutar: node test/sqlGuard.test.js
 * Cubre evasiones típicas: comentarios, literales, encadenado de sentencias,
 * DDL, DML de escritura, creación de usuarios/BD/SP y objetos del sistema.
 */
const assert = require('assert');
const { validarSqlReporte, revisarSql, normalizar } = require('../src/engine/sqlGuard');

let ok = 0, fallos = 0;
const test = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallos++; console.error(`  ✗ ${nombre}\n      ${e.message}`); }
};
/** Afirma que el SQL es RECHAZADO. */
const rechaza = (sqlText, etiqueta) => test(etiqueta, () => {
  const r = revisarSql(sqlText);
  assert.strictEqual(r.valida, false, `debió rechazarse: ${sqlText}`);
});
/** Afirma que el SQL es ACEPTADO. */
const acepta = (sqlText, etiqueta) => test(etiqueta, () => {
  const r = revisarSql(sqlText);
  assert.strictEqual(r.valida, true, `debió aceptarse pero: ${r.error}`);
});

console.log('\nSQL válido de reportes (debe ACEPTARSE)');
acepta('SELECT * FROM ARTICULOS', 'select simple');
acepta('SELECT A.CODARTICULO, SUM(L.UNIDADES) FROM ALBVENTALIN L JOIN ARTICULOS A ON A.CODARTICULO=L.CODARTICULO GROUP BY A.CODARTICULO',
  'select con join y group by');
acepta('WITH V AS (SELECT 1 AS X) SELECT * FROM V', 'CTE con WITH');
acepta('SELECT * FROM T WHERE FECHA BETWEEN {FECHA_INI} AND {FECHA_FIN}', 'con parámetros');
acepta("SELECT * FROM T WHERE TIPO = 'DELETE'", 'palabra peligrosa dentro de un literal');
acepta('SELECT [Mi Columna] FROM [Mi Tabla]', 'identificadores entre corchetes');
acepta('SELECT * FROM T -- comentario con DROP TABLE\n WHERE X=1', 'palabra peligrosa en comentario de línea');
acepta('SELECT * FROM T /* DELETE FROM X */ WHERE X=1', 'palabra peligrosa en comentario de bloque');
acepta('SELECT * FROM T;', 'punto y coma final permitido');
acepta('SELECT * FROM VENTAS ORDER BY FECHA DESC', 'order by');

console.log('\nBorrado y modificación de datos (debe RECHAZARSE)');
rechaza('DELETE FROM ARTICULOS', 'DELETE directo');
rechaza('TRUNCATE TABLE ARTICULOS', 'TRUNCATE');
rechaza('UPDATE ARTICULOS SET PRECIO = 0', 'UPDATE');
rechaza('INSERT INTO T VALUES (1)', 'INSERT');
rechaza('MERGE T USING S ON 1=1 WHEN MATCHED THEN DELETE', 'MERGE');
rechaza('SELECT * FROM T; DELETE FROM T', 'encadenar DELETE tras un SELECT');
rechaza('SELECT * FROM T;DROP TABLE T;', 'encadenar DROP');
rechaza("SELECT * FROM T WHERE 1=1; TRUNCATE TABLE T --", 'encadenado con comentario final');

console.log('\nDDL: crear/alterar objetos (debe RECHAZARSE)');
rechaza('DROP TABLE ARTICULOS', 'DROP TABLE');
rechaza('DROP DATABASE GENERAL', 'DROP DATABASE');
rechaza('CREATE DATABASE PRUEBA', 'CREATE DATABASE');
rechaza('CREATE TABLE T (A INT)', 'CREATE TABLE');
rechaza('CREATE PROCEDURE sp_malo AS SELECT 1', 'CREATE PROCEDURE');
rechaza('ALTER TABLE T ADD COLUMNA INT', 'ALTER TABLE');
rechaza('SELECT * INTO NUEVA_TABLA FROM T', 'SELECT INTO crea tabla');

console.log('\nUsuarios y permisos (debe RECHAZARSE)');
rechaza("CREATE LOGIN hacker WITH PASSWORD='x'", 'CREATE LOGIN');
rechaza('CREATE USER hacker FOR LOGIN hacker', 'CREATE USER');
rechaza('GRANT CONTROL ON DATABASE::GENERAL TO hacker', 'GRANT');
rechaza('REVOKE SELECT ON T FROM usuario', 'REVOKE');
rechaza('ALTER ROLE db_owner ADD MEMBER hacker', 'ALTER ROLE');

console.log('\nEjecución de código y objetos del sistema (debe RECHAZARSE)');
rechaza("EXEC sp_executesql N'DELETE FROM T'", 'EXEC sp_executesql');
rechaza("EXECUTE xp_cmdshell 'del *.*'", 'xp_cmdshell');
rechaza('SELECT * FROM OPENROWSET(...)', 'OPENROWSET');
rechaza('DBCC CHECKDB', 'DBCC');
rechaza('SHUTDOWN', 'SHUTDOWN');
rechaza("BACKUP DATABASE GENERAL TO DISK='c:\\x.bak'", 'BACKUP');
rechaza("SELECT * FROM T; EXEC sp_addlogin 'h','x'", 'sp_addlogin encadenado');
rechaza('SELECT * FROM T WAITFOR DELAY \'00:00:10\'', 'WAITFOR (retardo)');

console.log('\nEvasiones mediante comentarios y formato (debe RECHAZARSE)');
rechaza('SELECT * FROM T;/**/DELETE/**/FROM/**/T', 'DELETE partido con comentarios de bloque');
rechaza('SELECT 1;\n-- inocente\nDROP TABLE T', 'DROP tras comentario de línea');
rechaza('select * from t; delete from t', 'minúsculas');
rechaza('SeLeCt 1; DrOp TaBlE T', 'mayúsculas/minúsculas mezcladas');

console.log('\nEntradas inválidas');
rechaza('', 'SQL vacío');
rechaza('   ', 'solo espacios');
rechaza('EXPLAIN SELECT 1', 'no empieza por SELECT/WITH');

console.log('\nProcedimientos almacenados (sin lista blanca)');
const conSp = (sqlText) => revisarSql(sqlText, 'La consulta');

test('cualquier SP de usuario se acepta', () => {
  assert.strictEqual(conSp('EXEC dbo.REP_VENTASDIARIAS').valida, true);
  assert.strictEqual(conSp('EXEC RIP.PROC_REP_COMISIONES_DETALLADAS').valida, true);
});
test('SP sin esquema (asume dbo)', () => {
  assert.strictEqual(conSp('EXEC REP_VENTASDIARIAS').valida, true);
});
test('SP con parámetros del reporte', () => {
  const r = conSp('EXEC dbo.REP_VENTASDIARIAS @Desde = {FECHA_INI}, @Hasta = {FECHA_FIN}');
  assert.strictEqual(r.valida, true, r.error);
});
test('EXECUTE (forma larga) también se acepta', () => {
  assert.strictEqual(conSp('EXECUTE dbo.REP_VENTASDIARIAS').valida, true);
});
test('SP del sistema (sp_) se rechaza', () => {
  const r = conSp('EXEC rep.sp_no_valido_por_prefijo');
  assert.strictEqual(r.valida, false);
  assert.strictEqual(r.motivo, 'SP_SISTEMA');
});
test('no se puede encadenar tras un SP', () => {
  assert.strictEqual(conSp('EXEC dbo.REP_VENTASDIARIAS; DROP TABLE T').valida, false);
});
test('EXEC dinámico con cadena se rechaza', () => {
  assert.strictEqual(conSp("EXEC('DROP TABLE T')").valida, false);
});
test('xp_cmdshell sigue rechazado', () => {
  assert.strictEqual(conSp("EXEC xp_cmdshell 'dir'").valida, false);
});
test('sp_executesql (SQL dinámico) sigue rechazado', () => {
  assert.strictEqual(conSp("EXEC sp_executesql @s = ''").valida, false);
});

console.log('\nNormalizador');
test('quita literales, comentarios y corchetes', () => {
  const n = normalizar("SELECT 'DROP' /* DELETE */ FROM [Mi Tabla] -- TRUNCATE\n");
  assert.ok(!/DROP|DELETE|TRUNCATE/i.test(n), `no debe quedar rastro: ${n}`);
});

test('validarSqlReporte lanza con motivo', () => {
  try { validarSqlReporte('DELETE FROM T'); assert.fail('debió lanzar'); }
  catch (e) { assert.ok(e.motivo, 'el error debe traer motivo'); }
});

console.log(`\n${ok} pruebas OK${fallos ? `, ${fallos} FALLIDAS` : ''}\n`);
process.exit(fallos ? 1 : 0);
