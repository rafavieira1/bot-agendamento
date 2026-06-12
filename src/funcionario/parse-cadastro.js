// Extrai nome/setor/cargo do retorno do Exporta Dados 192399 (Cadastro de Funcionarios) por CPF.
// Helper puro — espelhado no Code node "BF" do WF4 (n8n não importa este arquivo).
import { stripDigits } from './normalize.js';

export function parseCadastroFuncionario(rows, cpf) {
  const target = stripDigits(cpf);
  const list = Array.isArray(rows) ? rows : [];
  const matches = list.filter((r) => stripDigits(r.CPFFUNCIONARIO) === target);
  if (matches.length === 0) return { encontrado: false };
  const row = matches.find((r) => /^ativo$/i.test(String(r.SITUACAO || '').trim())) || matches[0];
  const setor = String(row.NOMESETOR || '').trim();
  const cargo = String(row.NOMECARGO || '').trim();
  if (!setor || !cargo) return { encontrado: false };
  return {
    encontrado: true,
    nome: String(row.NOME || '').trim(),
    unidade: String(row.NOMEUNIDADE || '').trim(),
    setor,
    cargo,
  };
}
