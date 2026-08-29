from __future__ import annotations

from math import log

from app.domain.intelligence import EvaluationMetrics


def chronological_split[T](
    observations: tuple[T, ...],
    *,
    train_fraction: float = 0.70,
    validation_fraction: float = 0.15,
) -> tuple[tuple[T, ...], tuple[T, ...], tuple[T, ...]]:
    """Time-ordered split. The caller must provide chronologically sorted observations."""
    size = len(observations)
    train_end = int(size * train_fraction)
    validation_end = train_end + int(size * validation_fraction)
    return (
        observations[:train_end],
        observations[train_end:validation_end],
        observations[validation_end:],
    )


def _roc_auc(probabilities: tuple[float, ...], outcomes: tuple[int, ...]) -> float | None:
    positives = sum(outcomes)
    negatives = len(outcomes) - positives
    if positives == 0 or negatives == 0:
        return None
    ranked = sorted(zip(probabilities, outcomes, strict=True), key=lambda item: item[0])
    rank_sum = 0.0
    index = 0
    while index < len(ranked):
        end = index + 1
        while end < len(ranked) and ranked[end][0] == ranked[index][0]:
            end += 1
        average_rank = (index + 1 + end) / 2
        rank_sum += average_rank * sum(outcome for _, outcome in ranked[index:end])
        index = end
    return (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def evaluate_binary(
    probabilities: tuple[float, ...], outcomes: tuple[int, ...], *, bins: int = 10
) -> EvaluationMetrics:
    if len(probabilities) != len(outcomes):
        raise ValueError("Probabilities and outcomes must have the same length.")
    if not probabilities:
        return EvaluationMetrics(observations=0)
    clipped = tuple(min(0.999999, max(0.000001, value)) for value in probabilities)
    count = len(clipped)
    brier = (
        sum(
            (probability - outcome) ** 2
            for probability, outcome in zip(clipped, outcomes, strict=True)
        )
        / count
    )
    log_loss = (
        -sum(
            outcome * log(probability) + (1 - outcome) * log(1 - probability)
            for probability, outcome in zip(clipped, outcomes, strict=True)
        )
        / count
    )
    predicted = tuple(int(probability >= 0.5) for probability in clipped)
    true_positive = sum(
        prediction == outcome == 1 for prediction, outcome in zip(predicted, outcomes, strict=True)
    )
    false_positive = sum(
        prediction == 1 and outcome == 0
        for prediction, outcome in zip(predicted, outcomes, strict=True)
    )
    false_negative = sum(
        prediction == 0 and outcome == 1
        for prediction, outcome in zip(predicted, outcomes, strict=True)
    )
    accuracy = (
        sum(prediction == outcome for prediction, outcome in zip(predicted, outcomes, strict=True))
        / count
    )
    precision = (
        true_positive / (true_positive + false_positive)
        if (true_positive + false_positive)
        else 0.0
    )
    recall = (
        true_positive / (true_positive + false_negative)
        if (true_positive + false_negative)
        else 0.0
    )

    calibration_error = 0.0
    for bin_index in range(bins):
        lower = bin_index / bins
        upper = (bin_index + 1) / bins
        members = [
            (probability, outcome)
            for probability, outcome in zip(clipped, outcomes, strict=True)
            if lower <= probability < upper or (bin_index == bins - 1 and probability == 1)
        ]
        if not members:
            continue
        average_probability = sum(item[0] for item in members) / len(members)
        event_rate = sum(item[1] for item in members) / len(members)
        calibration_error += len(members) / count * abs(average_probability - event_rate)
    return EvaluationMetrics(
        observations=count,
        brier_score=brier,
        log_loss=log_loss,
        calibration_error=calibration_error,
        accuracy=accuracy,
        roc_auc=_roc_auc(clipped, outcomes),
        precision=precision,
        recall=recall,
    )
