import type { ProfessionId } from '../types';
import type { MissionTemplate, ProfessionModule } from './types';

export type { ProfessionModule, Terminology, ServiceTemplate, MissionTemplate } from './types';

const R = (reais: number) => reais * 100;

const commonIncome = ['Serviço', 'Venda de produto', 'Outros'];
const commonExpense = ['Material', 'Transporte', 'Alimentação', 'Impostos e taxas', 'Divulgação', 'Outros'];

/** Missões comuns, reaproveitadas pelos módulos. */
const missionNewClients = (title: string): MissionTemplate => ({
  id: 'novos_clientes', title, description: 'Cadastre 2 novos contatos para manter sua carteira crescendo.',
  metric: 'newClients', target: 2, xp: 30,
});
const missionExpenses: MissionTemplate = {
  id: 'controle_gastos', title: 'Controle seus gastos', description: 'Registre 3 despesas da semana e saiba seu lucro real.',
  metric: 'expensesLogged', target: 3, xp: 30,
};

const manutencao: ProfessionModule = {
  id: 'manutencao',
  name: 'Manutenção',
  icon: 'wrench',
  tagline: 'Reparos, instalações e reformas',
  examples: 'Eletricista, encanador, pintor, técnico, marido de aluguel',
  terms: {
    service: 'Serviço', services: 'Serviços', serviceArticle: 'o', client: 'Cliente', clients: 'Clientes',
    completeVerb: 'Concluir serviço', completedLabel: 'concluído', completedLabelPlural: 'concluídos',
  },
  serviceTemplates: [
    { name: 'Visita técnica', suggestedPrice: R(80) },
    { name: 'Instalação elétrica', suggestedPrice: R(150) },
    { name: 'Reparo hidráulico', suggestedPrice: R(120) },
    { name: 'Pintura de cômodo', suggestedPrice: R(400) },
    { name: 'Montagem de móveis', suggestedPrice: R(150) },
  ],
  incomeCategories: ['Mão de obra', 'Visita técnica', 'Venda de material', 'Outros'],
  expenseCategories: ['Material e peças', 'Ferramentas', 'Combustível', 'Transporte', 'Impostos e taxas', 'Outros'],
  tips: [
    'Fotografe o antes e depois: ajuda a vender o próximo serviço.',
    'Registre o material usado em cada serviço para calcular seu lucro real.',
    'Ofereça uma revisão preventiva aos clientes atendidos há mais de 6 meses.',
  ],
  missions: [
    { id: 'servicos_semana', title: 'Conclua 3 serviços', description: 'Finalize 3 serviços nesta semana.', metric: 'servicesCompleted', target: 3, xp: 40 },
    missionNewClients('Amplie sua clientela'),
    { id: 'material', title: 'Anote o material gasto', description: 'Registre 3 despesas com material, peças ou deslocamento.', metric: 'expensesLogged', target: 3, xp: 30 },
  ],
};

const beleza: ProfessionModule = {
  id: 'beleza',
  name: 'Beleza',
  icon: 'scissors',
  tagline: 'Cabelo, unhas, estética e maquiagem',
  examples: 'Cabeleireira, manicure, barbeiro, esteticista, maquiadora',
  terms: {
    service: 'Atendimento', services: 'Atendimentos', serviceArticle: 'o', client: 'Cliente', clients: 'Clientes',
    completeVerb: 'Concluir atendimento', completedLabel: 'concluído', completedLabelPlural: 'concluídos',
  },
  serviceTemplates: [
    { name: 'Corte', suggestedPrice: R(60) },
    { name: 'Escova', suggestedPrice: R(50) },
    { name: 'Manicure e pedicure', suggestedPrice: R(55) },
    { name: 'Coloração', suggestedPrice: R(150) },
    { name: 'Design de sobrancelhas', suggestedPrice: R(40) },
  ],
  incomeCategories: ['Atendimento', 'Venda de produto', 'Pacote', 'Outros'],
  expenseCategories: ['Produtos', 'Aluguel de cadeira/espaço', 'Equipamentos', 'Transporte', 'Divulgação', 'Outros'],
  tips: [
    'Anote as preferências de cada cliente nas observações do cadastro.',
    'Confirme os horários na véspera para reduzir faltas.',
    'Clientes que voltam a cada 30 dias são ótimos para pacotes mensais.',
  ],
  missions: [
    { id: 'atendimentos_semana', title: 'Realize 5 atendimentos', description: 'Conclua 5 atendimentos nesta semana.', metric: 'servicesCompleted', target: 5, xp: 40 },
    { id: 'agenda_cheia', title: 'Organize a agenda', description: 'Agende 4 atendimentos com data e horário.', metric: 'appointmentsScheduled', target: 4, xp: 30 },
    missionExpenses,
  ],
};

const limpeza: ProfessionModule = {
  id: 'limpeza',
  name: 'Limpeza',
  icon: 'sparkles',
  tagline: 'Residencial, comercial e pós-obra',
  examples: 'Diarista, faxineira, limpeza pós-obra, higienização de estofados',
  terms: {
    service: 'Limpeza', services: 'Limpezas', serviceArticle: 'a', client: 'Cliente', clients: 'Clientes',
    completeVerb: 'Concluir limpeza', completedLabel: 'concluída', completedLabelPlural: 'concluídas',
  },
  serviceTemplates: [
    { name: 'Diária residencial', suggestedPrice: R(180) },
    { name: 'Faxina pesada', suggestedPrice: R(250) },
    { name: 'Limpeza pós-obra', suggestedPrice: R(400) },
    { name: 'Limpeza comercial', suggestedPrice: R(220) },
    { name: 'Higienização de sofá', suggestedPrice: R(150) },
  ],
  incomeCategories: ['Diária', 'Limpeza avulsa', 'Contrato mensal', 'Outros'],
  expenseCategories: ['Produtos de limpeza', 'Equipamentos', 'Transporte', 'Alimentação', 'Impostos e taxas', 'Outros'],
  tips: [
    'Clientes fixos semanais dão previsibilidade: ofereça um valor mensal.',
    'Registre o gasto com produtos para ajustar o preço da diária.',
    'Combine o que está incluso antes de começar e anote nas observações.',
  ],
  missions: [
    { id: 'limpezas_semana', title: 'Conclua 4 limpezas', description: 'Finalize 4 limpezas nesta semana.', metric: 'servicesCompleted', target: 4, xp: 40 },
    missionNewClients('Conquiste novos clientes'),
    missionExpenses,
  ],
};

const alimentacao: ProfessionModule = {
  id: 'alimentacao',
  name: 'Alimentação',
  icon: 'chef',
  tagline: 'Encomendas, marmitas, doces e eventos',
  examples: 'Confeiteira, marmiteiro, salgadeira, buffet, cozinheira',
  terms: {
    service: 'Encomenda', services: 'Encomendas', serviceArticle: 'a', client: 'Cliente', clients: 'Clientes',
    completeVerb: 'Marcar como entregue', completedLabel: 'entregue', completedLabelPlural: 'entregues',
  },
  serviceTemplates: [
    { name: 'Bolo de aniversário', suggestedPrice: R(150) },
    { name: 'Cento de salgados', suggestedPrice: R(90) },
    { name: 'Marmitas da semana', suggestedPrice: R(120) },
    { name: 'Docinhos (cento)', suggestedPrice: R(110) },
    { name: 'Buffet para evento', suggestedPrice: R(800) },
  ],
  incomeCategories: ['Encomenda', 'Venda avulsa', 'Evento', 'Outros'],
  expenseCategories: ['Ingredientes', 'Embalagens', 'Gás e energia', 'Entrega', 'Equipamentos', 'Outros'],
  tips: [
    'Calcule o custo dos ingredientes por receita para precificar com segurança.',
    'Peça um sinal ao confirmar encomendas grandes.',
    'Anote alergias e restrições dos clientes nas observações.',
  ],
  missions: [
    { id: 'entregas_semana', title: 'Entregue 5 encomendas', description: 'Marque 5 encomendas como entregues nesta semana.', metric: 'servicesCompleted', target: 5, xp: 40 },
    { id: 'custos', title: 'Conheça seus custos', description: 'Registre 3 despesas com ingredientes, embalagens ou entrega.', metric: 'expensesLogged', target: 3, xp: 30 },
    missionNewClients('Novos clientes à mesa'),
  ],
};

const outros: ProfessionModule = {
  id: 'outros',
  name: 'Outros serviços',
  icon: 'briefcase',
  tagline: 'Qualquer serviço prestado por você',
  examples: 'Fotógrafo, professor particular, costureira, jardineiro, motorista',
  terms: {
    service: 'Serviço', services: 'Serviços', serviceArticle: 'o', client: 'Cliente', clients: 'Clientes',
    completeVerb: 'Concluir serviço', completedLabel: 'concluído', completedLabelPlural: 'concluídos',
  },
  serviceTemplates: [
    { name: 'Serviço avulso', suggestedPrice: R(100) },
    { name: 'Hora de trabalho', suggestedPrice: R(60) },
    { name: 'Pacote mensal', suggestedPrice: R(400) },
  ],
  incomeCategories: commonIncome,
  expenseCategories: commonExpense,
  tips: [
    'Mantenha o telefone dos clientes atualizado para facilitar o contato.',
    'Separe as despesas do negócio das despesas pessoais.',
    'Revise seus preços a cada 6 meses.',
  ],
  missions: [
    { id: 'servicos_semana', title: 'Conclua 3 serviços', description: 'Finalize 3 serviços nesta semana.', metric: 'servicesCompleted', target: 3, xp: 40 },
    missionNewClients('Amplie sua clientela'),
    missionExpenses,
  ],
};

export const PROFESSIONS: Record<ProfessionId, ProfessionModule> = { manutencao, beleza, limpeza, alimentacao, outros };

export const PROFESSION_LIST: ProfessionModule[] = [manutencao, beleza, limpeza, alimentacao, outros];

export function getProfession(id: ProfessionId | undefined | null): ProfessionModule {
  return (id && PROFESSIONS[id]) || outros;
}

export function isProfessionId(v: unknown): v is ProfessionId {
  return typeof v === 'string' && v in PROFESSIONS;
}
