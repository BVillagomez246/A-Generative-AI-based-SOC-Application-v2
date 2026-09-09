import { useRef, useState, useEffect } from 'react';
import { faCheck, faTimes, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { loginUser } from './authUtils';
import "./Login.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login = ({ onRegisterClick, onHomeClick }) => {
    const emailRef = useRef();
    const errRef = useRef();

    const [email, setEmail] = useState('');
    const [validEmail, setValidEmail] = useState(false);
    const [emailFocus, setEmailFocus] = useState(false);

    const [pwd, setPwd] = useState('');
    const [pwdFocus, setPwdFocus] = useState(false);

    const [errMsg, setErrMsg] = useState('');
    const [success, setSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        emailRef.current.focus();
    }, []);

    useEffect(() => {
        setValidEmail(EMAIL_REGEX.test(email));
    }, [email]);

    useEffect(() => {
        setErrMsg('');
    }, [email, pwd]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validEmail || !pwd) {
            setErrMsg("Invalid login details");
            return;
        }

        setIsSubmitting(true);

        const result = await loginUser(email, pwd);

        setIsSubmitting(false);

        if (!result.success) {
            setErrMsg("Invalid email or password");
            return;
        }

        setSuccess(true);
    };

    return (
        <div className="auth-page">
            {success ? (
                <section className="form-container">
                    <h1 className="title">Welcome back!</h1>

                    <p className="signup">
                        You are now logged in.
                    </p>

                    <button className="sign" onClick={() => onHomeClick(email)}>
                        Continue
                    </button>
                </section>
            ) : (
                <section className="form-container">
                    <p
                        ref={errRef}
                        className={errMsg ? "errmsg" : "offscreen"}
                        aria-live="assertive"
                    >
                        {errMsg}
                    </p>

                    <h1 className="title">Login</h1>

                    <form className="form" onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label htmlFor="login_email">
                                Email
                                <span className={validEmail ? "valid" : "hide"}>
                                    <FontAwesomeIcon icon={faCheck} />
                                </span>
                                <span className={validEmail || !email ? "hide" : "invalid"}>
                                    <FontAwesomeIcon icon={faTimes} />
                                </span>
                            </label>

                            <input
                                type="email"
                                id="login_email"
                                ref={emailRef}
                                autoComplete="off"
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                aria-invalid={validEmail ? "false" : "true"}
                                aria-describedby="loginemailnote"
                                onFocus={() => setEmailFocus(true)}
                                onBlur={() => setEmailFocus(false)}
                            />

                            <p
                                id="loginemailnote"
                                className={
                                    emailFocus && email && !validEmail
                                        ? "instructions"
                                        : "offscreen"
                                }
                            >
                                <FontAwesomeIcon icon={faInfoCircle} />
                                Must be a valid email address.
                            </p>
                        </div>

                        <div className="input-group">
                            <label htmlFor="login_password">
                                Password
                            </label>

                            <input
                                type="password"
                                id="login_password"
                                onChange={(e) => setPwd(e.target.value)}
                                required
                                onFocus={() => setPwdFocus(true)}
                                onBlur={() => setPwdFocus(false)}
                            />
                        </div>

                        <div className="forgot">
                            <a href="#">Forgot Password?</a>
                        </div>

                        <button
                            className="sign"
                            disabled={!validEmail || !pwd || isSubmitting}
                        >
                            {isSubmitting ? 'Signing in...' : 'Sign In'}
                        </button>

                        <p className="signup">
                            Do not have an account?{" "}
                            <button
                                type="button"
                                className="auth-link-btn"
                                onClick={onRegisterClick}
                            >
                                Sign up
                            </button>
                        </p>
                    </form>
                </section>
            )}
        </div>
    );
};

export default Login;
