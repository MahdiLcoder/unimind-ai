import asyncio
import time

import docker
from docker.types import LogConfig, Ulimit
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(title="UniMind isolated code runner")
docker_client = docker.from_env(timeout=8)
execution_slots = asyncio.Semaphore(2)

MAX_CODE_LENGTH = 8_000
MAX_EXECUTION_SECONDS = 5
MAX_OUTPUT_BYTES = 64 * 1024
SANDBOX_IMAGE = "unimind-python-sandbox:latest"


class CodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=MAX_CODE_LENGTH)


class CodeResult(BaseModel):
    exit_code: int | None
    stdout: str
    stderr: str
    timed_out: bool


def _decode_output(value: bytes | None) -> str:
    if not value:
        return ""
    output = value[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")
    if len(value) > MAX_OUTPUT_BYTES:
        return f"{output}\n[output truncated]"
    return output


def _execute_python(code: str) -> CodeResult:
    try:
        container = docker_client.containers.run(
            image=SANDBOX_IMAGE,
            command=["python", "-I", "-S", "-B", "-c", code],
            detach=True,
            user="10001:10001",
            working_dir="/workspace",
            network_mode="none",
            read_only=True,
            mem_limit="128m",
            memswap_limit="128m",
            nano_cpus=500_000_000,
            pids_limit=32,
            ulimits=[
                Ulimit(name="core", soft=0, hard=0),
                Ulimit(name="fsize", soft=1_048_576, hard=1_048_576),
                Ulimit(name="nofile", soft=64, hard=64),
            ],
            tmpfs={"/tmp": "rw,noexec,nosuid,size=16m,uid=10001,gid=10001,mode=700"            },
            cap_drop=["ALL"],
            log_config=LogConfig(
                type="local",
                config={"max-size": "128k", "max-file": "2"},
            ),
        )
    except docker.errors.DockerException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The isolated execution worker is unavailable",
        ) from exc

    timed_out = False
    exit_code: int | None = None
    try:
        deadline = time.monotonic() + MAX_EXECUTION_SECONDS
        while True:
            container.reload()
            if container.status != "running":
                exit_code = int(container.attrs["State"]["ExitCode"])
                break
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                container.kill()
                break
            time.sleep(min(0.1, remaining))

        stdout, stderr = container.attach(
            stdout=True,
            stderr=True,
            logs=True,
            demux=True,
        )
        return CodeResult(
            exit_code=exit_code,
            stdout=_decode_output(stdout),
            stderr=_decode_output(stderr),
            timed_out=timed_out,
        )
    finally:
        container.remove(force=True)


@app.get("/health")
def health() -> dict[str, str]:
    try:
        docker_client.ping()
    except docker.errors.DockerException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The container engine is unavailable",
        ) from exc
    return {"status": "ok"}


@app.post("/execute", response_model=CodeResult)
async def execute_code(body: CodeRequest) -> CodeResult:
    try:
        await asyncio.wait_for(execution_slots.acquire(), timeout=0.25)
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The execution worker is busy; retry shortly",
        ) from exc

    try:
        return await asyncio.to_thread(_execute_python, body.code)
    finally:
        execution_slots.release()
