import { motion, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'

/** A number that rolls to its new value on a spring. Tabular mono, so width never jitters. */
export function AnimatedNumber({
  value,
  decimals = 0,
  className,
}: {
  value: number
  decimals?: number
  className?: string
}) {
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.8 })
  const text = useTransform(spring, (v) => (decimals ? v.toFixed(decimals) : String(Math.round(v))))
  useEffect(() => {
    spring.set(value)
  }, [spring, value])
  return <motion.span className={`num ${className ?? ''}`}>{text}</motion.span>
}
