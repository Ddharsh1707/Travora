"""Builds the location seed migrations from public datasets (run locally, output committed).
airports: OurAirports (public domain), IATA-coded airports with scheduled service, plus every IATA-coded airport in India
stations: datameet/railways stations.json (ODbL), Indian Railways stations with coordinates
cities:   GeoNames cities1000 via lutangar/cities.json (CC BY 4.0), India only
"""
import csv, json, re, sys, unicodedata
src, out = sys.argv[1], sys.argv[2]
fold = lambda s: unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
key = lambda s: re.sub(r"[^A-Z0-9]+", " ", fold(s).upper()).strip()
q = lambda s: "null" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"
def rows_sql(rows):
    return ",\n".join(f"({q(k)},{q(c)},{q(n)},{q(key(n))},{q(city)},{q(reg)},{q(cc)},{lat:.6f},{lng:.6f},{q(s)},{q(ref)})" for k,c,n,city,reg,cc,lat,lng,s,ref in rows)
HEAD = "insert into public.locations (kind, code, name, name_key, city, region, country, lat, lng, source, source_ref) values\n"
TAIL = "\non conflict do nothing;\n"

ap = []
for r in csv.DictReader(open(f"{src}/airports.csv", encoding="utf-8")):
    if not r["iata_code"] or not re.fullmatch(r"[A-Z]{3}", r["iata_code"]): continue
    if r["type"] not in ("large_airport", "medium_airport", "small_airport"): continue
    if r["scheduled_service"] != "yes" and r["iso_country"] != "IN": continue
    ap.append(("airport", r["iata_code"], fold(r["name"]), fold(r["municipality"]) or None, r["iso_region"], r["iso_country"], float(r["latitude_deg"]), float(r["longitude_deg"]), "ourairports", r["ident"]))
seen = set(); ap = [a for a in ap if not (a[1] in seen or seen.add(a[1]))]

st = []
for f in json.load(open(f"{src}/stations.json"))["features"]:
    p, g = f["properties"], f["geometry"]
    if not g or not p.get("code") or not re.fullmatch(r"[A-Z0-9]{1,6}", p["code"]): continue
    lng, lat = g["coordinates"]
    if not (6 <= lat <= 37 and 68 <= lng <= 98): continue  # outside India: bad point in the source, skip
    name = fold(p["name"]).strip().upper()
    st.append(("station", p["code"], name, None, p.get("state"), "IN", lat, lng, "datameet_railways", p["code"]))

ci = []
for c in json.load(open(f"{src}/cities.json")):
    if c["country"] != "IN": continue
    ci.append(("city", None, fold(c["name"]), fold(c["name"]), None, "IN", float(c["lat"]), float(c["lng"]), "geonames", None))

hdr = lambda what: f"""-- =============================================================================
-- Place coordinates, part of travel intelligence part 3: {what}
-- Generated from public datasets; coordinates are copied, never estimated.
-- Safe to run more than once (existing rows are left alone).
-- =============================================================================
"""
def chunks(rows, n=2000):
    for i in range(0, len(rows), n): yield rows[i:i+n]
with open(f"{out}/20261107000410_locations_airports.sql", "w") as fh:
    fh.write(hdr("airports (OurAirports, public domain, ourairports.com)"))
    for c in chunks(ap): fh.write(HEAD + rows_sql(c) + TAIL)
with open(f"{out}/20261107000420_locations_stations.sql", "w") as fh:
    fh.write(hdr("Indian railway stations (datameet/railways, ODbL, github.com/datameet/railways)"))
    for c in chunks(st): fh.write(HEAD + rows_sql(c) + TAIL)
with open(f"{out}/20261107000430_locations_cities.sql", "w") as fh:
    fh.write(hdr("Indian towns and cities (GeoNames, CC BY 4.0, geonames.org)"))
    for c in chunks(ci): fh.write(HEAD + rows_sql(c) + TAIL)
print("airports", len(ap), "stations", len(st), "cities", len(ci))
