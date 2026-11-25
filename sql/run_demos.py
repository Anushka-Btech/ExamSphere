#!/usr/bin/env python3
"""Runs every block of sql/demos/*.sql against the local TEST server database and writes docs/sql-demonstrations.md.
Blocks start with '-- ### title', then '-- @expect ...' lines, then SQL. Uses `dolt sql` because that is the engine
available in the build sandbox; the .sql files themselves are plain MySQL 8 and run unchanged with the mysql client:
    mysql -u root -p examsphere_db < sql/demos/02_joins.sql
Usage: python3 sql/run_demos.py <dolt-data-dir>
"""
import re, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent
data_dir = sys.argv[1]
out = ["# SQL demonstrations\n",
       "Every block below was **executed against the seeded database** and the output pasted here. The queries are in `sql/demos/*.sql` and use only real tables and columns.\n",
       "> The outputs were produced on **Dolt** (a MySQL-compatible engine) because MySQL 8 could not be installed in the build environment. Result rows are engine-independent; `EXPLAIN` text and numeric formatting (for example `2.00`) can differ slightly in MySQL 8.\n"]
failed = 0
for f in sorted((root / "demos").glob("*.sql")):
    for block in re.split(r"(?m)^-- ### ", f.read_text())[1:]:
        title, _, rest = block.partition("\n")
        expect = " ".join(l[len("-- @expect"):].strip() for l in rest.splitlines() if l.startswith("-- @expect"))
        sql = "\n".join(l for l in rest.splitlines() if not l.startswith("-- @expect")).strip()
        stmts = [x.strip() for x in re.split(r";\s*\n|;\s*$", sql) if x.strip()]
        # one session per block (transactions need it); blocks whose statements are EXPECTED to fail run one by one
        groups = [[x] for x in stmts] if "rejecting" in title.lower() else [stmts]
        shown = []
        for g in groups:
            code = ";\n".join(g) + ";"
            r = subprocess.run(["dolt", "sql", "-q", "USE examsphere_db;\n" + code], cwd=data_dir, capture_output=True, text=True)
            text = (r.stdout + r.stderr).strip()
            if r.returncode and "rejecting" not in title.lower():
                failed += 1
            shown.append(f"```sql\n{code}\n```\n```text\n{text}\n```" if text else f"```sql\n{code}\n```")
        out.append(f"## {title.strip()}\n\n**Expected:** {expect}\n\n" + "\n".join(shown) + "\n")
(root.parent / "docs" / "sql-demonstrations.md").write_text("\n".join(out))
print("blocks with unexpected failures:", failed)
