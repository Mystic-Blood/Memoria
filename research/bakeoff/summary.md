# Memoria Ollama bakeoff 1790662575320

Git: `d0ba9f91f44fad0c9cff440bf0de4ef36e0b67e3`  
Ollama: ollama version is 0.34.4  
num_ctx (VRAM probe): 4096  
temperature: 0

## VRAM fit (Step 3)

### qwen2.5:7b-instruct

```
{
  "httpStatus": 200,
  "latencyMs": 42842,
  "generateOk": true,
  "generateError": null,
  "ollamaPs": "NAME                   ID              SIZE      PROCESSOR          CONTEXT    UNTIL                   \nqwen2.5:7b-instruct    845dbda0ea48    5.1 GB    18%/82% CPU/GPU    4096       About a minute from now    \n",
  "num_ctx": 4096
}
```

### llama3.1:8b

```
{
  "httpStatus": 200,
  "latencyMs": 8335,
  "generateOk": true,
  "generateError": null,
  "ollamaPs": "NAME           ID              SIZE      PROCESSOR          CONTEXT    UNTIL                   \nllama3.1:8b    46e0c10c039e    5.6 GB    25%/75% CPU/GPU    4096       About a minute from now    \n",
  "num_ctx": 4096
}
```

### mistral:7b-instruct

```
{
  "httpStatus": 200,
  "latencyMs": 5955,
  "generateOk": true,
  "generateError": null,
  "ollamaPs": "NAME                   ID              SIZE      PROCESSOR          CONTEXT    UNTIL                   \nmistral:7b-instruct    6577803aa9a0    5.1 GB    17%/83% CPU/GPU    4096       About a minute from now    \n",
  "num_ctx": 4096
}
```

### gemma3:4b

```
{
  "httpStatus": 200,
  "latencyMs": 32354,
  "generateOk": true,
  "generateError": null,
  "ollamaPs": "NAME         ID              SIZE      PROCESSOR    CONTEXT    UNTIL                   \ngemma3:4b    a2af6cc3eb7f    2.9 GB    100% GPU     4096       About a minute from now    \n",
  "num_ctx": 4096
}
```

### llama3:8b

```
{
  "httpStatus": 200,
  "latencyMs": 7990,
  "generateOk": true,
  "generateError": null,
  "ollamaPs": "NAME         ID              SIZE      PROCESSOR          CONTEXT    UNTIL                   \nllama3:8b    365c0bd3c000    5.3 GB    22%/78% CPU/GPU    4096       About a minute from now    \n",
  "num_ctx": 4096
}
```

## Test A

| model | n | schemaValidRate | exceptionOrTimeoutRate | timeoutCount | avgLatencyMs | p95LatencyMs | tokensPerSec | fenceOrProseCount | fenceOrProseRate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qwen2.5:7b-instruct | 33 | 1 | 0 | 0 | 3249.242424242424 | 4398 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| llama3.1:8b | 33 | 1 | 0 | 0 | 2918.818181818182 | 4189 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| mistral:7b-instruct | 33 | 1 | 0 | 0 | 2551.2727272727275 | 3535 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| gemma3:4b | 33 | 1 | 0 | 0 | 1887.5757575757575 | 2059 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| llama3:8b | 33 | 1 | 0 | 0 | 2750.878787878788 | 4214 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |

## Test B

| model | n | schemaValidRate | exceptionOrTimeoutRate | timeoutCount | avgLatencyMs | p95LatencyMs | tokensPerSec | fenceOrProseCount | fenceOrProseRate | multiFact_ge2ops | correctionRefinement_updateWithTarget | noise_emptyOrNone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qwen2.5:7b-instruct | 32 | 1 | 0 | 0 | 2039.5625 | 3600 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 | 0/4 | 8/8 | 2/4 |
| llama3.1:8b | 32 | 1 | 0 | 0 | 4152.6875 | 7911 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 | 4/4 | 7/8 | 1/4 |
| mistral:7b-instruct | 32 | 1 | 0 | 0 | 3386.1875 | 7760 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 | 3/4 | 7/8 | 0/4 |
| gemma3:4b | 32 | 1 | 0 | 0 | 1194.6875 | 1619 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 | 0/4 | 8/8 | 0/4 |
| llama3:8b | 32 | 1 | 0 | 0 | 3316.75 | 7781 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 | 4/4 | 8/8 | 0/4 |

## Test C

| model | n | schemaValidRate | exceptionOrTimeoutRate | timeoutCount | avgLatencyMs | p95LatencyMs | tokensPerSec | fenceOrProseCount | fenceOrProseRate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qwen2.5:7b-instruct | 20 | 1 | 0 | 0 | 830.55 | 891 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| llama3.1:8b | 20 | 1 | 0 | 0 | 1150.5 | 1284 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| mistral:7b-instruct | 20 | 1 | 0 | 0 | 1050.65 | 1104 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| gemma3:4b | 20 | 1 | 0 | 0 | 307.4 | 320 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |
| llama3:8b | 20 | 1 | 0 | 0 | 888.25 | 1033 | UNAVAILABLE from generateObject/safeGenerateObject | 0 | 0 |

## Schema failures

_none_
