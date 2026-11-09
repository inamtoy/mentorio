from django.db import IntegrityError, router, transaction
from rest_framework import serializers

from common.codegen import generate_sequential_code

# Generated codes are MAX+1 reads, so two admins saving at the same moment
# get the same one; each retry re-reads MAX after the other save committed.
GENERATED_CODE_ATTEMPTS = 5


class OptionalSequentialCodeMixin:
    """For a ModelSerializer whose per-org code (student_code, teacher_code)
    the admin may leave blank: on create a blank code becomes the next
    "<code_prefix>####" in the org, on update a blank code keeps the current
    one. Hand-typed codes were error-prone (one student got just "EDU") and
    nothing checked them. Set `code_field`, `code_prefix` and `code_label`
    on the serializer, and mark the field optional in Meta.extra_kwargs.

    The (organization, code) unique constraint is the real guard: a save that
    loses a race on it used to raise IntegrityError and return a 500. Now a
    generated code is regenerated and retried, and a typed code becomes the
    same 400 field error validate() gives.
    """

    code_field: str
    code_prefix: str
    code_label: str

    def get_validators(self):
        # DRF's auto (organization, <code>) unique-together validator forces
        # both fields to be present, defeating the optional code — uniqueness
        # of a code that *is* given is checked in validate() instead.
        return []

    def _code_taken_error(self) -> serializers.ValidationError:
        return serializers.ValidationError(
            {self.code_field: f"This {self.code_label} is already used in your center. Leave it blank to get a new one."}
        )

    def _is_code_conflict(self, error: IntegrityError) -> bool:
        """True only for the (organization, code) unique constraint — any
        other integrity error (a bad foreign key, another unique field) is a
        different problem and must not be retried or reworded."""
        constraint = getattr(getattr(error.__cause__, "diag", None), "constraint_name", None)
        return any(
            getattr(c, "name", None) == constraint and self.code_field in getattr(c, "fields", ())
            for c in self.Meta.model._meta.constraints
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        code = attrs.get(self.code_field, "").strip()
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        if code:
            model = self.Meta.model
            taken = model.all_objects.filter(organization=organization, **{self.code_field: code})
            if self.instance is not None:
                taken = taken.exclude(pk=self.instance.pk)
            if taken.exists():
                raise self._code_taken_error()
        return attrs

    def _save_guarded(self, save):
        # A savepoint, so a failed INSERT doesn't abort the request's
        # surrounding transaction (OrganizationContextMiddleware's atomic()).
        with transaction.atomic(using=router.db_for_write(self.Meta.model)):
            return save()

    def create(self, validated_data):
        create = super().create
        if validated_data.get(self.code_field, "").strip():
            try:
                return self._save_guarded(lambda: create(validated_data))
            except IntegrityError as error:
                if self._is_code_conflict(error):
                    raise self._code_taken_error() from error
                raise

        for attempt in range(1, GENERATED_CODE_ATTEMPTS + 1):
            validated_data[self.code_field] = generate_sequential_code(
                self.Meta.model, validated_data["organization"], prefix=self.code_prefix, code_field=self.code_field
            )
            try:
                return self._save_guarded(lambda: create(validated_data))
            except IntegrityError as error:
                if not self._is_code_conflict(error) or attempt == GENERATED_CODE_ATTEMPTS:
                    raise

    def update(self, instance, validated_data):
        if self.code_field in validated_data and not validated_data[self.code_field].strip():
            validated_data.pop(self.code_field)
        update = super().update
        try:
            return self._save_guarded(lambda: update(instance, validated_data))
        except IntegrityError as error:
            if self._is_code_conflict(error):
                raise self._code_taken_error() from error
            raise
