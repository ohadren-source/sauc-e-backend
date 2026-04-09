"""
flavor_palette_taste_palate_misen_plat_twist_plot_thickens.py

Core cooking ontology for CHEF ROCKER:
- IngredientLibrary: grocery-store of flavor vectors
- WorldPalateAdapter: bridge to BLUEPRINT / WorldPalate kernel
- Wrapper shells: PizzaShell, PieCrust, DumplingWrapper
- Protein cores: WaterProtein, LandProtein, AvianProtein
- Kernels: PizzaKernel, PieKernel, DumplingKernel

NOTE: This is a structural skeleton. Ingredient data and concrete
WorldPalate implementation are provided elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Mapping, Any, Protocol


# ============================================================================
# INGREDIENT LIBRARY (THE GROCERY STORE)
# ============================================================================

class IngredientLibrary:
    """
    Registry of ingredients and their flavor/taste vectors.

    Each ingredient maps to a dict of scalar attributes in the spirit of
    BP.txt / WorldPalate, e.g.:

        {
            "salt": 0.8,
            "umami": 0.9,
            "fat": 0.5,
            "sweet": 0.1,
            "aroma": 0.4,
            "ego": 0.3,
            ...
        }

    This class DOES NOT hard-code world data; it only defines the interface.
    """

    def __init__(self, data: Optional[Mapping[str, Mapping[str, float]]] = None) -> None:
        """
        Parameters
        ----------
        data:
            Optional initial mapping from ingredient name to flavor vector.
            May be populated externally from any dataset.
        """
        self._data: Dict[str, Dict[str, float]] = {
            k: dict(v) for k, v in (data or {}).items()
        }

    # -- basic registry operations -------------------------------------------------

    def register(self, name: str, vector: Mapping[str, float]) -> None:
        """Add or overwrite a single ingredient vector."""
        self._data[name] = dict(vector)

    def bulk_register(self, mapping: Mapping[str, Mapping[str, float]]) -> None:
        """Add or overwrite multiple ingredient vectors."""
        for name, vector in mapping.items():
            self._data[name] = dict(vector)

    def has(self, name: str) -> bool:
        """Return True if ingredient is present in the library."""
        return name in self._data

    def get_vector(self, name: str) -> Dict[str, float]:
        """
        Return the flavor vector for an ingredient.

        Raises
        ------
        KeyError if the ingredient is unknown.
        """
        return dict(self._data[name])

    def all_ingredients(self) -> List[str]:
        """Return a list of all registered ingredient names."""
        return list(self._data.keys())


# ============================================================================
# WORLD PALATE ADAPTER
# ============================================================================

class PalateKernel(Protocol):
    """
    Protocol for the underlying WorldPalate-like kernel.

    This lets palette_plate_plot.py depend only on the interface,
    not on a specific implementation.
    """

    def compile_recipe(self, name: str, components: Mapping[str, float]) -> int:
        """
        Evaluate a recipe by name and component weights and return a
        VINCO-like bit (1 = jackpot / WIN, 0 = noise).
        """
        ...


@dataclass
class WorldPalateAdapter:
    """
    Adapter that allows the wrapper/protein kernels to talk to the
    underlying WorldPalate engine using ingredient names and ratios.

    It uses IngredientLibrary to expand names into flavor vectors if needed
    before forwarding to the kernel.
    """

    kernel: PalateKernel
    library: IngredientLibrary

    def score(self, dish_name: str, components: Mapping[str, float]) -> int:
        """
        Evaluate a dish by name.

        Parameters
        ----------
        dish_name:
            Human-readable identifier for the dish.
        components:
            Mapping from ingredient name to relative ratio/weight.

        Returns
        -------
        int
            VINCO-style bit (1 = WIN, 0 = NOISE) as defined by the kernel.
        """
        # NOTE: This method intentionally assumes the kernel understands
        # ingredient names directly, as in your WorldPalate example.
        # If a richer vector aggregation step is needed, this adapter
        # is where it would live.
        return self.kernel.compile_recipe(dish_name, components)


# ============================================================================
# WRAPPER SHELLS (FAST-COOK DOUGH DOMAINS)
# ============================================================================

@dataclass
class PizzaShell:
    """
    Flat dough base for pizza-like constructions.

    Core parameters are structural; actual flavor vectors come from
    IngredientLibrary.
    """

    dough_type: str              # e.g. "neapolitan", "sicilian", "roman"
    thickness_mm: float          # physical thickness of the base
    delicacy: float              # 0–1, higher = easier to burn/tear
    hydration_ratio: float       # water / flour
    oil_ratio: float             # oil / flour


@dataclass
class PieCrust:
    """
    Crust for sweet or savory pies.

    Represents shortcrust, puff, etc., independent of specific fillings.
    """

    flour_type: str              # e.g. "all_purpose", "bread", "whole_wheat"
    fat_type: str                # e.g. "butter", "lard", "shortening", "oil"
    thickness_mm: float
    delicacy: float              # 0–1
    is_sweet: bool               # True for dessert crusts, False for savory


@dataclass
class DumplingWrapper:
    """
    Wrapper shell for dumplings and all dumpling-like foods.

    This encodes the structural properties that matter for heat and time.
    """

    dough_type: str              # e.g. "wheat", "masa", "filo", "batter"
    thickness_mm: float          # physical thickness of wrapper
    delicacy: float              # 0–1, thin/fragile wrappers have higher values
    closure: str                 # "closed", "vented", "open"
    cook_method: str             # "boil", "steam", "fry", "bake", "grill"

    def expected_wrapper_cook_time(self) -> float:
        """
        Estimate characteristic cook time for the wrapper, in minutes,
        as a function of thickness, delicacy, and cook_method.

        Implementation detail is left for later; this method exists
        so invariants can be expressed against it.
        """
        raise NotImplementedError


# ============================================================================
# PROTEIN CORES (SLOW DOMAIN)
# ============================================================================

@dataclass
class ProteinBase:
    """
    Abstract base for all protein categories.

    Proteins live in the slow-cook domain and are typically brought to
    safe/desired doneness BEFORE being enclosed in a fast-cook wrapper.
    """

    name: str                    # human label, e.g. "short_rib", "shrimp"
    cut_size_mm: float           # characteristic thickness of piece
    base_cook_time_min: float    # time to reach doneness from raw
    safe_temp_c: float           # safety floor for internal temp
    prep_state: str              # "raw", "seared", "braised", "confited", etc.

    def effective_cook_time_min(self) -> float:
        """
        Effective cook time given current prep_state.

        For example, 'braised' short rib will have a much smaller remaining
        cook time than a raw one of the same cut size.
        """
        raise NotImplementedError


@dataclass
class WaterProtein(ProteinBase):
    """
    Proteins from water (fish, shellfish, etc.).
    """
    habitat: str = "water"


@dataclass
class LandProtein(ProteinBase):
    """
    Proteins from land animals (beef, pork, lamb, etc.).
    """
    habitat: str = "land"


@dataclass
class AvianProtein(ProteinBase):
    """
    Proteins from birds (chicken, turkey, duck, etc.).
    """
    habitat: str = "avian"


# ============================================================================
# KERNELS: PIZZA, PIE, DUMPLING
# ============================================================================

@dataclass
class PizzaKernel:
    """
    Kernel for pizza-like constructions.

    This kernel is responsible only for structure and ingredient references.
    Taste evaluation is delegated to WorldPalateAdapter.
    """

    shell: PizzaShell
    toppings: Dict[str, float]               # ingredient -> ratio
    library: IngredientLibrary
    palate: WorldPalateAdapter

    def score(self, name: str = "pizza") -> int:
        """
        Evaluate this pizza using the palate kernel.

        Implementation will assemble component ingredient weights and call
        palate.score(name, components).
        """
        raise NotImplementedError


@dataclass
class PieKernel:
    """
    Kernel for sweet or savory pies.
    """

    crust: PieCrust
    filling_ingredients: Dict[str, float]    # ingredient -> ratio
    library: IngredientLibrary
    palate: WorldPalateAdapter

    def score(self, name: str = "pie") -> int:
        """
        Evaluate this pie using the palate kernel.
        """
        raise NotImplementedError


@dataclass
class DumplingKernel:
    """
    Kernel for dumpling-like foods (the dumpling aperture).

    Combines:
    - a DumplingWrapper (fast-cook shell)
    - an optional ProteinBase core (slow domain)
    - additional filling ingredients (veg, aromatics, etc.)
    """

    wrapper: DumplingWrapper
    protein: Optional[ProteinBase]
    filling_ingredients: Dict[str, float]    # ingredient -> ratio
    library: IngredientLibrary
    palate: WorldPalateAdapter

    # --- INVARIANTS (SPEC-LEVEL, IMPLEMENTATION TBD) ------------------------

    max_wrapper_factor: float = field(default=0.25)
    """
    Upper bound for wrapper cook time relative to base protein cook time.

    Conceptual invariant:
        wrapper_cook_time_min <= max_wrapper_factor * protein.base_cook_time_min
    If violated, protein must be pre-cooked or reduced in size.
    """

    def check_time_invariants(self) -> None:
        """
        Assert-time relationship between wrapper cook time and protein cook time.

        This method should:
        - compute wrapper_time = wrapper.expected_wrapper_cook_time()
        - compare it to protein.base_cook_time_min or protein.effective_cook_time_min()
        - raise or signal violation if the dumpling is physically impossible
          under the laws you've defined.
        """
        raise NotImplementedError

    def score(self, name: str = "dumpling") -> int:
        """
        Evaluate this dumpling using the palate kernel.

        Implementation will:
        - enforce time/heat invariants (check_time_invariants)
        - assemble ingredient components (wrapper + filling [+ protein mapping])
        - call palate.score(name, components)
        """
        raise NotImplementedError
