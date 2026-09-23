-- Switch default LLM from gpt-5.6-luna to gpt-6-luna.
insert or ignore into llm_models (id, provider, model, is_active, is_default)
values ('llm-openai-gpt-6-luna', 'openai', 'gpt-6-luna', 1, 0);

update llm_models set is_default = 0, updated_at = datetime('now') where is_default = 1;
update llm_models set is_default = 1, is_active = 1, updated_at = datetime('now')
where model = 'gpt-6-luna';
update llm_models set is_active = 0, updated_at = datetime('now')
where model = 'gpt-5.6-luna';

update chats
set config = replace(config, 'gpt-5.6-luna', 'gpt-6-luna'),
    updated_at = datetime('now')
where instr(config, 'gpt-5.6-luna') > 0;
