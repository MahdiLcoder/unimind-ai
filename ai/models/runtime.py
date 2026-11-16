import gc
import logging
from collections.abc import Callable
from threading import RLock
from typing import TypeVar, cast

T = TypeVar("T")
U = TypeVar("U")
logger = logging.getLogger(__name__)


class SingleModelRuntime:
    """Keep at most one heavyweight model object resident in this process."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._model_id: str | None = None
        self._model: object | None = None

    def get_or_load(self, model_id: str, loader: Callable[[], T]) -> T:
        with self._lock:
            if self._model_id == model_id and self._model is not None:
                return cast(T, self._model)
            self._release()
            logger.info("Loading local inference model %s", model_id)
            model = loader()
            self._model_id = model_id
            self._model = model
            return model

    def run(
        self,
        model_id: str,
        loader: Callable[[], T],
        operation: Callable[[T], U],
    ) -> U:
        with self._lock:
            model = self.get_or_load(model_id, loader)
            return operation(model)

    def _release(self) -> None:
        if self._model_id is not None:
            logger.info("Releasing local inference model %s", self._model_id)
        self._model = None
        self._model_id = None
        gc.collect()

    def unload(self) -> None:
        with self._lock:
            self._release()


default_model_runtime = SingleModelRuntime()
