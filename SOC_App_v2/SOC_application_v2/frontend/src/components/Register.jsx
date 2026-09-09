import { useRef, useState, useEffect } from 'react';
import { faCheck, faTimes, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { registerUser } from './authUtils';
import "./Login.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PWD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%]).{8,24}$/;

const Register = ({ onLoginClick }) => {
    const emailRef = useRef();
    const errRef = useRef();

    const [email, setEmail] = useState('');
    const [validEmail, setValidEmail] = useState(false);
    const [emailFocus, setEmailFocus] = useState(false);

    const [pwd, setPwd] = useState('');
    const [validPwd, setValidPwd] = useState(false);
    const [pwdFocus, setPwdFocus] = useState(false);

    const [matchPwd, setMatchPwd] = useState('');
    const [validMatch, setValidMatch] = useState(false);
    const [matchFocus, setMatchPwdFocus] = useState(false);

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
        const result = PWD_REGEX.test(pwd);
        setValidPwd(result);

        const match = pwd === matchPwd;
        setValidMatch(match);
    }, [pwd, matchPwd]);

    useEffect(() => {
        setErrMsg('');
    }, [email, pwd, matchPwd]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validEmail || !validPwd || !validMatch) {
            setErrMsg("Invalid entry");
            return;
        }

        setIsSubmitting(true);

        const result = await registerUser(email, pwd);

        setIsSubmitting(false);

        if (!result.success) {
            setErrMsg(result.error || "Could not create account");
            return;
        }

        setSuccess(true);
    };

    return (
        <div className="auth-page">
            {success ? (
                <section className="form-container">
                    <h1 className="title">Success!</h1>

                    <p className="signup">
                        Your account has been created.
                    </p>

                    <button
                        type="button"
                        className="sign"
                        onClick={onLoginClick}
                    >
                        Sign In
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

                    <h1 className="title">Register</h1>

                    <form className="form" onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label htmlFor="email">
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
                                id="email"
                                ref={emailRef}
                                autoComplete="off"
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                aria-invalid={validEmail ? "false" : "true"}
                                aria-describedby="emailnote"
                                onFocus={() => setEmailFocus(true)}
                                onBlur={() => setEmailFocus(false)}
                            />

                            <p
                                id="emailnote"
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
                            <label htmlFor="password">
                                Password
                                <span className={validPwd ? "valid" : "hide"}>
                                    <FontAwesomeIcon icon={faCheck} />
                                </span>
                                <span className={validPwd || !pwd ? "hide" : "invalid"}>
                                    <FontAwesomeIcon icon={faTimes} />
                                </span>
                            </label>

                            <input
                                type="password"
                                id="password"
                                onChange={(e) => setPwd(e.target.value)}
                                required
                                aria-invalid={validPwd ? "false" : "true"}
                                aria-describedby="pwdnote"
                                onFocus={() => setPwdFocus(true)}
                                onBlur={() => setPwdFocus(false)}
                            />

                            <p
                                id="pwdnote"
                                className={
                                    pwdFocus && pwd && !validPwd
                                        ? "instructions"
                                        : "offscreen"
                                }
                            >
                                <FontAwesomeIcon icon={faInfoCircle} />
                                8 to 24 characters.<br />
                                Must include at least one uppercase letter, one lowercase letter, and one number.<br />
                                Special characters allowed: ! @ # $ %
                            </p>
                        </div>

                        <div className="input-group">
                            <label htmlFor="confirm_pwd">
                                Confirm Password
                                <span className={validMatch && matchPwd ? "valid" : "hide"}>
                                    <FontAwesomeIcon icon={faCheck} />
                                </span>
                                <span className={validMatch || !matchPwd ? "hide" : "invalid"}>
                                    <FontAwesomeIcon icon={faTimes} />
                                </span>
                            </label>

                            <input
                                type="password"
                                id="confirm_pwd"
                                onChange={(e) => setMatchPwd(e.target.value)}
                                required
                                aria-invalid={validMatch ? "false" : "true"}
                                aria-describedby="matchnote"
                                onFocus={() => setMatchPwdFocus(true)}
                                onBlur={() => setMatchPwdFocus(false)}
                            />

                            <p
                                id="matchnote"
                                className={
                                    matchFocus && matchPwd && !validMatch
                                        ? "instructions"
                                        : "offscreen"
                                }
                            >
                                <FontAwesomeIcon icon={faInfoCircle} />
                                Must match the password entered above.
                            </p>
                        </div>

                        <button
                            className="sign"
                            disabled={!validEmail || !validPwd || !validMatch || isSubmitting}
                        >
                            {isSubmitting ? 'Creating account...' : 'Sign Up'}
                        </button>

                        <p className="signup">
                            Already have an account?{" "}
                            <button
                                type="button"
                                className="auth-link-btn"
                                onClick={onLoginClick}
                            >
                                Sign in
                            </button>
                        </p>
                    </form>
                </section>
            )}
        </div>
    );
};

export default Register;
