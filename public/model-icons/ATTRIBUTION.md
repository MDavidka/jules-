# Model icon attribution

These are vendor brand marks used to identify models in the model picker. They are
included for nominative identification of each model's publisher only. All trademarks
remain the property of their respective owners.

| File | Mark | Source |
| --- | --- | --- |
| `deepseek.svg` | DeepSeek | [svgl.app](https://svgl.app) (`deepseek.svg`) |
| `meta.svg` | Meta (Llama) | [svgl.app](https://svgl.app) (`meta.svg`) |
| `mistral.svg` | Mistral AI | [svgl.app](https://svgl.app) (`mistral-ai_logo.svg`) |
| `nvidia.svg` | NVIDIA (Nemotron) | [svgl.app](https://svgl.app) (`nvidia-icon-light.svg`) |
| `openai.svg` | OpenAI (gpt-oss) | [svgl.app](https://svgl.app) (`openai_dark.svg`) |
| `kimi.svg` | Moonshot AI (Kimi) | [svgl.app](https://svgl.app) (`kimi-icon.svg`) |
| `google.svg` | Google | [svgl.app](https://svgl.app) (`gemini.svg`) |
| `glm.svg` | Z.ai (GLM) | Official Z.ai mark, minified from `z-cdn.chatglm.cn/z-ai/static/logo.svg` |

svgl is an open-source SVG logo library by [pheralb](https://github.com/pheralb/svgl).
`glm.svg` is not in the svgl catalog, so the official Z.ai mark was used instead and
reduced to its actual geometry (the upstream file shipped ~11 KB of unused Illustrator
style rules).

Any model whose publisher has no icon here falls back to a generated monogram tile
(see `components/models/model-icon.tsx`).
