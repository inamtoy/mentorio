from rest_framework import serializers

from common.codegen import generate_sequential_code


class OptionalSequentialCodeMixin:
    """For a ModelSerializer whose per-org code (student_code, teacher_code)
    the admin may leave blank: on create a blank code becomes the next
    "<code_prefix>####" in the org, on update a blank code keeps the current
    one. Hand-typed codes were error-prone (one student got just "EDU") and
    nothing checked them. Set `code_field`, `code_prefix` and `code_label`
    on the serializer, and mark the field optional in Meta.extra_kwargs.
    """

    code_field: str
    code_prefix: str
    code_label: str

    def get_validators(self):
        # DRF's auto (organization, <code>) unique-together validator forces
        # both fields to be present, defeating the optional code — uniqueness
        # of a code that *is* given is checked in validate() instead.
        return []

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
                raise serializers.ValidationError(
                    {self.code_field: f"This {self.code_label} is already used in your center. Leave it blank to get a new one."}
                )
        return attrs

    def create(self, validated_data):
        if not validated_data.get(self.code_field, "").strip():
            validated_data[self.code_field] = generate_sequential_code(
                self.Meta.model, validated_data["organization"], prefix=self.code_prefix, code_field=self.code_field
            )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if self.code_field in validated_data and not validated_data[self.code_field].strip():
            validated_data.pop(self.code_field)
        return super().update(instance, validated_data)
