from allauth.account.fields import PasswordField
from allauth.account.forms import LoginForm
from django import forms


class ProductUpdateSubscriptionForm(forms.Form):
    email = forms.EmailField(max_length=254)

    def clean_email(self):
        return self.fields["email"].clean(self.cleaned_data["email"].lower())


class PasswordLoginForm(LoginForm):
    # allauth drops the password field when signup collects none.
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["password"] = PasswordField(label="Password", autocomplete="current-password")


class EmailEntryForm(forms.Form):
    email = forms.EmailField(
        max_length=254,
        widget=forms.EmailInput(attrs={"autocomplete": "email", "placeholder": "Email address"}),
    )
