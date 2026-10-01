from django import forms


class ProductUpdateSubscriptionForm(forms.Form):
    email = forms.EmailField(max_length=254)

    def clean_email(self):
        return self.fields["email"].clean(self.cleaned_data["email"].lower())
