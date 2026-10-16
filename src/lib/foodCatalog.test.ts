import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readXlsx } from "./xlsx.ts";
import { diffCatalog, num, parseCatalog, rankFoods, searchTerms, sourceCredit, type ExistingRow } from "./foodCatalog.ts";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

test("num: traço, NA, reavaliação, vírgula e gralhas", () => {
  assert.equal(num(12.5), 12.5);
  assert.equal(num("Tr"), 0);
  assert.equal(num(" Tr"), 0);
  assert.equal(num("NA"), null);
  assert.equal(num("*"), null);
  assert.equal(num(" "), null);
  assert.equal(num("3,5"), 3.5);
  assert.equal(num(",0,02"), 0.02);
  assert.equal(num(null), null);
});

test("xlsx: lê folhas, textos partilhados e entidades", () => {
  const sheets = readXlsx(fx("insa-mini.xlsx"));
  assert.deepEqual(sheets.map((s) => s.name), ["INSA - BDCA_v 9.9 - 2030", "Informação adicional"]);
  assert.equal(sheets[0].rows[2][1], "Abacate, Hass & cia <1>");
  assert.equal(sheets[0].rows[2][4], 176);
  assert.equal(sheets[0].rows[0][0], null);
});

test("xlsx: rejeita ficheiros que não são Excel", () => {
  assert.throws(() => readXlsx(new TextEncoder().encode("isto não é um excel")), /não é um Excel/);
});

test("INSA: deteta a fonte, versão, bebidas em ml e ignora linhas inválidas", () => {
  const c = parseCatalog(readXlsx(fx("insa-mini.xlsx")));
  assert.equal(c.source, "insa");
  assert.equal(c.versao, "9.9 - 2030");
  assert.deepEqual(c.notas, ["Atualizado em 01-01-2030"]);
  assert.equal(c.rows.length, 2);
  const [abacate, cerveja] = c.rows;
  assert.equal(abacate.external_id, 624);
  assert.equal(abacate.kcal_100g, 176);
  assert.equal(abacate.fat_100g, 17.4);
  assert.equal(abacate.grupo, "Frutos e produtos derivados de frutos");
  assert.equal(abacate.extra.hidratos, "disponiveis");
  assert.equal(abacate.extra.subgrupo, "Fruta");
  assert.equal(cerveja.unidade, "ml");
  assert.deepEqual(
    c.ignored.map((i) => i.motivo),
    ["sem valor de energia", "código 624 repetido"],
  );
});

test("TACO: cabeçalho em 3 linhas, grupos, páginas repetidas e legenda", () => {
  const c = parseCatalog(readXlsx(fx("taco-mini.xlsx")));
  assert.equal(c.source, "taco");
  assert.equal(c.rows.length, 2);
  const [arroz, cabra] = c.rows;
  assert.equal(arroz.name, "Arroz, integral, cozido");
  assert.equal(arroz.grupo, "Cereais e derivados");
  assert.equal(arroz.kcal_100g, 123.53);
  assert.equal(arroz.protein_100g, 2.59);
  assert.equal(arroz.carbs_100g, 25.81);
  assert.equal(arroz.fiber_100g, 2.75);
  assert.equal(arroz.extra.sodium, 0); // "Tr"
  assert.equal(arroz.extra.cholesterol, undefined); // "NA"
  assert.equal(arroz.extra.hidratos, "totais");
  assert.equal(cabra.name, "Leite, de cabra"); // espaços duplos limpos
  assert.equal(cabra.grupo, "Leite e derivados");
  assert.equal(c.ignored.length, 1);
  assert.match(c.ignored[0].motivo, /reavaliação/);
});

test("formato mudado: para com mensagem clara", () => {
  const sheets = readXlsx(fx("insa-mini.xlsx"));
  sheets[0].rows[1] = sheets[0].rows[1].map((h) => (String(h).startsWith("Prote") ? "Outra coisa" : h));
  assert.throws(() => parseCatalog(sheets), /formato do Excel do INSA mudou.*protein/);
  assert.throws(() => parseCatalog([{ name: "x", rows: [["a", "b"]] }]), /Não reconheci/);
});

test("diff: novos, alterados, iguais, inativados e reativados", () => {
  const { rows } = parseCatalog(readXlsx(fx("insa-mini.xlsx")));
  const base = { grupo: null, unidade: "g", protein_100g: 0, carbs_100g: 0, fat_100g: 0, fiber_100g: 0, sugar_100g: 0 };
  const existing: ExistingRow[] = [
    { ...rows[0], external_id: "624", kcal_100g: "170", ativo: true }, // valor mudou
    { ...base, external_id: 726, name: "Cerveja branca", grupo: "Bebidas alcoólicas", unidade: "ml", kcal_100g: 43, protein_100g: 0.3, carbs_100g: 3.2, ativo: false },
    { ...base, external_id: 1, name: "Saiu da tabela", kcal_100g: 10, ativo: true },
    { ...base, external_id: 2, name: "Já inativo", kcal_100g: 10, ativo: false },
  ];
  const d = diffCatalog(existing, rows);
  assert.equal(d.total, 2);
  assert.equal(d.novos, 0);
  assert.equal(d.alterados, 1);
  assert.equal(d.iguais, 1);
  assert.equal(d.reativados, 1);
  assert.equal(d.inativados, 1);
  assert.deepEqual(d.exemplosInativados, ["Saiu da tabela"]);
  assert.deepEqual(d.exemplosAlterados[0].campos, [{ campo: "kcal_100g", antes: 170, depois: 176 }]);
  assert.deepEqual(diffCatalog([], rows).novos, 2);
});

test("pesquisa: palavras sem acentos e ordenação por fonte", () => {
  assert.deepEqual(searchTerms("Peito de Frango, grelhado"), ["peito", "frango", "grelhado"]);
  assert.deepEqual(searchTerms("Açúcar"), ["acucar"]);
  assert.deepEqual(searchTerms("a"), []);
  const foods = [
    { name: "Frango assado com batatas (Marca)", source: "calorieapi" },
    { name: "Peito de frango grelhado", source: "taco" },
    { name: "Frango, peito, sem pele, grelhado", source: "insa" },
    { name: "Frango, inteiro, cru", source: "insa" },
    { name: "Meu frango", source: "custom" },
  ];
  assert.deepEqual(
    rankFoods(foods, "frango").map((f) => f.source + ":" + f.name),
    ["custom:Meu frango", "insa:Frango, inteiro, cru", "insa:Frango, peito, sem pele, grelhado", "taco:Peito de frango grelhado", "calorieapi:Frango assado com batatas (Marca)"],
  );
});

test("crédito das fontes", () => {
  assert.match(sourceCredit("insa", "7.1 - 2026") ?? "", /INSA\. v 7\.1 - 2026/);
  assert.match(sourceCredit("taco", "4.ª edição") ?? "", /TACO, 4\.ª edição\. NEPA\/UNICAMP/);
  assert.equal(sourceCredit("custom"), null);
});

// Com os ficheiros oficiais disponíveis localmente (não vão para o repositório)
const REAL = process.env.CATALOG_FILES?.split(",") ?? [];
for (const p of REAL.filter((f) => existsSync(f))) {
  test(`ficheiro oficial: ${p.split("/").pop()}`, () => {
    const c = parseCatalog(readXlsx(readFileSync(p)));
    if (c.source === "insa") {
      assert.ok(c.rows.length > 1300, `INSA com ${c.rows.length}`);
      assert.equal(c.ignored.length, 0);
    } else {
      assert.equal(c.rows.length + c.ignored.length, 597);
      assert.ok(c.ignored.length <= 10);
    }
    for (const r of c.rows) {
      assert.ok(r.kcal_100g >= 0 && r.kcal_100g < 1000, `${r.name}: ${r.kcal_100g} kcal`);
      assert.ok(r.protein_100g + r.carbs_100g + r.fat_100g <= 101, `${r.name}: macros > 100 g`);
    }
  });
}
