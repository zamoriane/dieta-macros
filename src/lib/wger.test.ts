import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, norm, prescription, repsDefault, searchGroups, toExerciseRow } from "./wger.ts";

test("norm remove acentos e símbolos", () => {
  assert.equal(norm("  Elevação  Pélvica! "), "elevacao pelvica");
});

test("searchGroups expande termos de ginásio em português", () => {
  assert.deepEqual(searchGroups("supino inclinado"), [["supino", "bench press", "chest press"], ["inclinado"]]);
  assert.deepEqual(searchGroups("Levantamento terra"), [["levantamento terra", "deadlift"]]);
  assert.deepEqual(searchGroups("a"), []);
});

test("htmlToText converte listas e parágrafos sem HTML", () => {
  const t = htmlToText("<p>Deite-se&nbsp;no banco.</p><ol><li>Desça</li><li>Suba <b>devagar</b></li></ol><script>x</script>");
  assert.equal(t, "Deite-se no banco.\n\n• Desça\n• Suba devagar\nx");
  assert.ok(!t.includes("<"));
});

test("toExerciseRow prefere português, cai para inglês e guarda a autoria", () => {
  const row = toExerciseRow({
    id: 51,
    category: { name: "Arms" },
    muscles: [{ id: 13, name: "Brachialis", name_en: "", is_front: true, image_url_main: "/static/images/muscles/main/muscle-13.svg" }],
    muscles_secondary: [],
    equipment: [{ name: "Barbell" }, { name: "Bench" }],
    license: { short_name: "CC-BY-SA 3" },
    license_author: "burenl",
    images: [{ image: "https://wger.de/media/x.webp", is_main: true, thumbnails: { small: "https://wger.de/media/x.200.png" } }],
    translations: [
      { language: 2, name: "Barbell Wrist Curl", description: "<p>Sitting on a bench, grab a barbell.</p>", aliases: [{ alias: "Forearm Curls" }] },
      { language: 7, name: "Flexão de Punho com Barra", description: "<p>Sentado em um banco, pegue uma barra.</p>", license_author: "burenl" },
    ],
  })!;
  assert.equal(row.nome, "Flexão de Punho com Barra");
  assert.equal(row.nome_en, "Barbell Wrist Curl");
  assert.equal(row.categoria, "Braços");
  assert.deepEqual(row.equipamento, ["Barra", "Banco"]);
  assert.equal(row.musculos[0].nome, "Braquial");
  assert.equal(row.musculos[0].img, "https://wger.de/static/images/muscles/main/muscle-13.svg");
  assert.equal(row.descricao, "Sentado em um banco, pegue uma barra.");
  assert.equal(row.autor, "burenl");
  assert.equal(row.rank, 0);
  assert.ok(row.busca.includes("forearm curls") && row.busca.includes("barbell wrist curl") && row.busca.includes("bracos"));
});

test("toExerciseRow ignora exercícios sem nome em pt/en", () => {
  assert.equal(toExerciseRow({ id: 1, translations: [{ language: 1, name: "Kniebeuge" }] }), null);
});

test("prescription e repsDefault", () => {
  assert.equal(prescription({ series: 4, reps: "8-10", carga_kg: "40.00", descanso_s: 90 }), "4 × 8-10 · 40 kg · 90 s");
  assert.equal(prescription({ series: 3, reps: "12", carga_kg: null, descanso_s: 120 }), "3 × 12 · 2 min");
  assert.equal(repsDefault("8-12"), 8);
  assert.equal(repsDefault("até à falha"), null);
});
