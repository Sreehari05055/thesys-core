-- Active chat models. gpt-6-luna stays the default from 003.
insert or ignore into llm_models (id, provider, model, is_active, is_default)
values
  ('llm-openai-gpt-6.1-terra', 'openai', 'gpt-6.1-terra', 1, 0),
  ('llm-openai-gpt-6.2-sol', 'openai', 'gpt-6.2-sol', 1, 0),
  ('llm-openai-gpt-6.2-astra', 'openai', 'gpt-6.2-astra', 1, 0);

update llm_models set is_active = 1, updated_at = datetime('now')
where model in (
  'gpt-5.6-luna',
  'gpt-6-luna',
  'gpt-6.1-terra',
  'gpt-6.2-sol',
  'gpt-6.2-astra'
);
