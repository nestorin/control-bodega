import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

type CommonProps = {
  children: ReactNode;
  className?: string;
};
type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    as?: "button";
  };
type AnchorProps = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    as: "a";
    href: string;
  };
type DivProps = CommonProps & HTMLAttributes<HTMLDivElement> & { as: "div" };
export type TouchTargetProps = ButtonProps | AnchorProps | DivProps;

const baseStyles =
  "min-h-[48px] min-w-[48px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3276a8] focus-visible:ring-offset-2 active:scale-[0.98] transition-transform duration-75 touch-manipulation";

export const TouchTarget = forwardRef<HTMLElement, TouchTargetProps>(function TouchTarget(
  { children, className = "", ...props },
  ref,
) {
  const classes = `${baseStyles} ${className}`;
  if (props.as === "a") {
    const { as: _as, ...anchorProps } = props;
    return (
      <a ref={ref as Ref<HTMLAnchorElement>} className={classes} {...anchorProps}>
        {children}
      </a>
    );
  }
  if (props.as === "div") {
    const { as: _as, ...divProps } = props;
    return (
      <div ref={ref as Ref<HTMLDivElement>} className={classes} {...divProps}>
        {children}
      </div>
    );
  }
  const { as: _as, ...buttonProps } = props;
  return (
    <button ref={ref as Ref<HTMLButtonElement>} className={classes} {...buttonProps}>
      {children}
    </button>
  );
});

TouchTarget.displayName = "TouchTarget";
