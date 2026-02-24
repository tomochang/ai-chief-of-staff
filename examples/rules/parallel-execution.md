# Plan -> Implementation Parallel Execution Rules

## Principle

**Always execute independent tasks in parallel.** Only serialize when there are dependencies.

## Plan Mode Exit -> Implementation Start

1. **Decompose the plan file into task units**
   - Explicitly mark dependencies for each task (blocks / blockedBy)
   - No dependency = parallelizable

2. **Launch parallelizable tasks simultaneously in a single message**
   - Independent file reads -> multiple Read calls in 1 message
   - Independent file edits -> multiple Edit calls in 1 message
   - Independent investigations -> multiple Task (subagent) calls in 1 message
   - Independent commands -> multiple Bash calls in 1 message

3. **Dependency chains are serial**
   - Schema -> API -> Frontend (output of prior stage is input to next)
   - File creation -> running tests on that file
   - git add -> git commit (chain with `&&` within the same transaction)

## Parallel Tool Call Patterns

### Do (parallel)

```
In 1 message:
- Read(fileA) + Read(fileB) + Read(fileC)
- Bash(test frontend) + Bash(test backend)  <- if independent
- Task(research A) + Task(research B)
- Edit(fileA) + Edit(fileB)  <- different files
- Grep(patternA) + Grep(patternB)
```

### Don't (must be serial)

```
- Edit(fileA) -> then Edit(fileB) based on result  <- dependency
- Write(new file) -> Read(that file)
- Bash(npm install) -> Bash(npm test)
```

## Conditions for Parallel Subagent Launch

Launch via Task tool in parallel when **all** of the following are met:

- 3 or more independent tasks exist
- No shared state between tasks
- File edit scopes do not overlap

## Notes

- If one parallel tool call fails, siblings may also be cancelled -> retry individually on failure
- Subagents cannot launch other subagents (hierarchy is 1 level only)
- Do not sacrifice code correctness for parallelization
